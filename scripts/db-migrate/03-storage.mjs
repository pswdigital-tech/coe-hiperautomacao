#!/usr/bin/env node
// =============================================================================
// 03-storage.mjs — copia os ARQUIVOS do Storage da origem para o destino.
// =============================================================================
// Por que existe: pg_dump copia storage.objects (os METADADOS), mas os binários
// moram no S3, fora do Postgres. Depois do 02-restore o banco novo acha que tem
// os arquivos e devolve 404 em todo download até este passo rodar.
//
// Os paths são preservados byte a byte de propósito: opportunity_documents.
// storage_path e tenants.logo_path guardam o path como texto. Path diferente =
// anexo e logo quebrados.
//
// Rodar da RAIZ do projeto:  node scripts/db-migrate/03-storage.mjs
// =============================================================================
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))

// Parser mínimo de .env — evita depender de dotenv estar instalado.
let envFile
try {
  envFile = readFileSync(resolve(HERE, '.env'), 'utf8')
} catch {
  console.error('✗ scripts/db-migrate/.env não existe. Copie env.example para .env e preencha.')
  process.exit(1)
}
for (const line of envFile.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
  if (!m) continue
  process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const { SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY } = process.env
for (const [k, v] of Object.entries({ SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY })) {
  if (!v || v.includes('OLDREF') || v.includes('NEWREF') || v.startsWith('service_role_key_')) {
    console.error(`✗ ${k} não preenchida em scripts/db-migrate/.env`)
    process.exit(1)
  }
}
if (SOURCE_URL === TARGET_URL) {
  console.error('✗ SOURCE_URL e TARGET_URL são iguais. Abortando.')
  process.exit(1)
}

const opts = { auth: { persistSession: false } }
const src = createClient(SOURCE_URL, SOURCE_SERVICE_KEY, opts)
const dst = createClient(TARGET_URL, TARGET_SERVICE_KEY, opts)

const DRY_RUN = process.argv.includes('--dry-run')
const CONCURRENCY = 8
const PAGE = 1000

// list() pagina em no máximo 1000 itens e não desce em subpasta — daí a
// recursão com offset. Sem isso, um tenant com muitos anexos é copiado pela
// metade em silêncio.
async function listAll(client, bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    if (!data?.length) break
    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      const full = prefix ? `${prefix}${item.name}` : item.name
      if (item.id === null || !item.metadata) out.push(...await listAll(client, bucket, `${full}/`))
      else out.push({ path: full, size: item.metadata.size, mimetype: item.metadata.mimetype, cacheControl: item.metadata.cacheControl })
    }
    if (data.length < PAGE) break
  }
  return out
}

async function ensureBucket(bucket) {
  const { data } = await dst.storage.getBucket(bucket.id)
  if (data) return `já existe (public=${data.public})`
  if (DRY_RUN) return 'CRIARIA'
  const { error } = await dst.storage.createBucket(bucket.id, {
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  })
  if (error) throw new Error(`createBucket ${bucket.id}: ${error.message}`)
  return 'criado'
}

async function copyFile(bucket, file) {
  const { data, error: dErr } = await src.storage.from(bucket).download(file.path)
  if (dErr) throw new Error(`download: ${dErr.message}`)
  // upsert: o 02-restore já trouxe a linha de storage.objects, então sem upsert
  // o upload devolve "Duplicate" mesmo com o S3 vazio.
  const { error: uErr } = await dst.storage.from(bucket).upload(file.path, data, {
    upsert: true,
    contentType: file.mimetype || undefined,
    cacheControl: file.cacheControl?.replace(/^max-age=/, '') || undefined,
  })
  if (uErr) throw new Error(`upload: ${uErr.message}`)
}

async function pool(items, worker, size) {
  let i = 0
  const results = []
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { await worker(items[idx]); results.push({ ok: true, item: items[idx] }) }
      catch (e) { results.push({ ok: false, item: items[idx], error: e.message }) }
    }
  }))
  return results
}

const main = async () => {
  console.log(`Storage  ${SOURCE_URL}  ->  ${TARGET_URL}`)
  if (DRY_RUN) console.log('MODO DRY-RUN — nada será escrito.\n')

  const { data: buckets, error } = await src.storage.listBuckets()
  if (error) throw new Error(`listBuckets origem: ${error.message}`)
  console.log(`\n${buckets.length} bucket(s) na origem: ${buckets.map((b) => b.id).join(', ')}\n`)

  const falhas = []
  let totalOk = 0, total = 0

  for (const bucket of buckets) {
    console.log(`▸ ${bucket.id}  (public=${bucket.public})`)
    console.log(`  destino: ${await ensureBucket(bucket)}`)

    const files = await listAll(src, bucket.id)
    const bytes = files.reduce((a, f) => a + (f.size || 0), 0)
    console.log(`  ${files.length} arquivo(s), ${(bytes / 1048576).toFixed(1)} MB`)
    total += files.length

    if (DRY_RUN) { files.slice(0, 5).forEach((f) => console.log(`    ${f.path}`)); if (files.length > 5) console.log(`    ... +${files.length - 5}`); continue }

    let done = 0
    const res = await pool(files, async (f) => {
      await copyFile(bucket.id, f)
      if (++done % 25 === 0 || done === files.length) process.stdout.write(`\r  copiados ${done}/${files.length}`)
    }, CONCURRENCY)
    if (files.length) process.stdout.write('\n')

    for (const r of res) if (!r.ok) falhas.push({ bucket: bucket.id, path: r.item.path, error: r.error })
    totalOk += res.filter((r) => r.ok).length
    console.log('')
  }

  if (DRY_RUN) { console.log(`\nDRY-RUN: ${total} arquivo(s) seriam copiados.`); return }

  console.log(`\nResumo: ${totalOk}/${total} arquivo(s) copiados.`)
  if (falhas.length) {
    console.log(`\n${falhas.length} falha(s):`)
    for (const f of falhas) console.log(`  ${f.bucket}/${f.path} — ${f.error}`)
    process.exit(1)
  }
  console.log('Storage migrado.')
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1) })
