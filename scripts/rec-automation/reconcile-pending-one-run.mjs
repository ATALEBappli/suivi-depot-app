// Clôture du seul reçu gha-45038142518-deploy, sans nouveau déploiement.
import {main} from './reconcile-pending-deploy.mjs';
import {RECOVERY_ONE_RUN} from './inspect-pending-deploy.mjs';
import {Refusal} from './validation.mjs';

main(RECOVERY_ONE_RUN,4).catch(error=>{
  console.error('REC_RECONCILE_STOP '+(error instanceof Refusal?error.code:'RECONCILIATION_FAILED'));
  process.exitCode=1;
});
