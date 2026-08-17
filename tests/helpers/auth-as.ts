import {
  authedClient,
  serviceRoleClient,
} from '../setup/supabase-test-client';
import {
  FGCOOP_TEST_EMAIL,
  ACME_TEST_EMAIL,
  PSW_STAFF_TEST_EMAIL,
  TEST_PASSWORD,
} from '../setup/seed-test-tenants';

export const asFgcoop = () => authedClient(FGCOOP_TEST_EMAIL, TEST_PASSWORD);
export const asAcme = () => authedClient(ACME_TEST_EMAIL, TEST_PASSWORD);
export const asPswStaff = () => authedClient(PSW_STAFF_TEST_EMAIL, TEST_PASSWORD);
export const asService = serviceRoleClient;
