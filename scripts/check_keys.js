const fs = require('fs');

const missing = {
  'shell': [
    'navTooltips.overview',
    'navTooltips.situation',
    'navTooltips.record',
    'navTooltips.medications',
    'navTooltips.hemodynamics',
    'navTooltips.respiratory'
  ],
  'uc01': [
    'situation.detail'
  ],
  'uc02': [
    'table.section',
    'table.statusShort',
    'table.synchronized',
    'table.expandSection',
    'actions.reviewShort',
    'evidence.gateNumeric',
    'evidence.gateUnit',
    'evidence.gateTimestamp',
    'evidence.gateEvidenceId',
    'evidence.gateIdentity',
    'evidence.gateMembership'
  ],
  'uc03': [
    'safetyReview.age',
    'safetyReview.weight',
    'safetyReview.creatinine',
    'dialog.reasonClinical',
    'dialog.reasonPatient',
    'dialog.reasonAddressed',
    'dialog.reasonIncorrect',
    'dialog.reasonOther',
    'dialog.selectReasonRequired',
    'dialog.overridden'
  ],
  'uc04': [
    'gauge.predictiveRisk',
    'gauge.hypotensionRiskHpi',
    'gauge.modelEstimateExplain',
    'gauge.aiModel',
    'determinants.mapDeterminants'
  ]
};

for (const [f, keys] of Object.entries(missing)) {
  const vi = JSON.parse(fs.readFileSync('src/messages/vi/' + f + '.json', 'utf8'));
  console.log('=== ' + f + ' ===');
  for (const k of keys) {
    const parts = k.split('.');
    let val = vi;
    for (const p of parts) val = val ? val[p] : undefined;
    console.log(k + ' -> ' + JSON.stringify(val));
  }
}
