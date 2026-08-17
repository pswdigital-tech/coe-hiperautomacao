'use client';

// =============================================================================
// Helpers de campo reutilizáveis pelos steps do wizard.
// =============================================================================

type LabelProps = {
  children: React.ReactNode;
  required?: boolean;
};

function Label({ children, required }: LabelProps) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="text-[11px] text-red-700 dark:text-red-300 mt-1">{message}</div>;
}

const inputClass =
  'w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15';

const inputErrClass = inputClass.replace('border-bdr', 'border-red-400 dark:border-red-600');

type TextProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'number';
};

export function TextField({
  label,
  value,
  onChange,
  required,
  error,
  placeholder,
  type = 'text',
}: TextProps) {
  return (
    <div className="mb-3">
      <Label required={required}>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={error ? inputErrClass : inputClass}
      />
      <Err message={error} />
    </div>
  );
}

type TextareaProps = TextProps & { rows?: number };

export function TextareaField({
  label,
  value,
  onChange,
  required,
  error,
  placeholder,
  rows = 3,
}: TextareaProps) {
  return (
    <div className="mb-3">
      <Label required={required}>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={(error ? inputErrClass : inputClass) + ' leading-relaxed'}
      />
      <Err message={error} />
    </div>
  );
}

type SelectProps = {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  error?: string;
  placeholder?: string;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = 'Selecione...',
}: SelectProps) {
  return (
    <div className="mb-3">
      <Label required={required}>{label}</Label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={error ? inputErrClass : inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Err message={error} />
    </div>
  );
}
