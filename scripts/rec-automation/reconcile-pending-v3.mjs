// Clôture ciblée du seul reçu v3, sans écriture Apps Script ou Sheets.
import {main} from './reconcile-pending-deploy.mjs';
import {RECOVERY_V3} from './inspect-pending-deploy.mjs';
import {Refusal} from './validation.mjs';

main(RECOVERY_V3,3).catch(e=>{
  console.error('REC_RECONCILE_STOP '+(e instanceof Refusal?e.code:'RECONCILIATION_FAILED'));
  process.exitCode=1;
});
