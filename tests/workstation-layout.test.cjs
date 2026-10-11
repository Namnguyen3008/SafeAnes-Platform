const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const styles = read('src/app/globals.css');

test('UC04 workspace uses a bounded responsive height instead of its forced 870px floor', () => {
  const source = read('src/components/modules/uc04/HemodynamicIntelligenceWorkspace.tsx');
  assert.doesNotMatch(source, /min-h-\[870px\]/);
  assert.match(source, /uc04-workspace-layout/);
  assert.match(styles, /\.uc04-workspace-layout[\s\S]*?min-height:\s*710px/);
});

test('UC04 chart rows retain readable minimums and recent events fit their grid row', () => {
  const workspace = read('src/components/modules/uc04/MainClinicalWorkspace.tsx');
  const events = read('src/components/modules/uc04/RecentEventsPanel.tsx');
  assert.match(workspace, /uc04-main-workspace/);
  assert.match(styles, /\.uc04-main-workspace[\s\S]*?minmax\(380px/);
  assert.match(events, /uc04-events-panel/);
  assert.doesNotMatch(events, /h-\[168px\]\s+shrink-0/);
});

test('UC04 summary rail cards fit the short workstation layout without clipping clinical values', () => {
  const rail = read('src/components/modules/uc04/RightClinicalSummaryRail.tsx');
  const alert = read('src/components/modules/uc04/CurrentHypotensionAlert.tsx');
  assert.match(rail, /uc04-summary-rail/);
  assert.match(alert, /uc04-current-alert/);
  assert.match(styles, /\.uc04-summary-rail[\s\S]*?overflow:\s*visible/);
});

test('UC04 active safety alert moves above the supporting metric stack', () => {
  const rail = read('src/components/modules/uc04/RightClinicalSummaryRail.tsx');
  assert.match(rail, /const isAlertActive = activeAlert !== null && activeAlert\.status !== "RESOLVED"/);
  assert.match(rail, /isAlertActive && <CurrentHypotensionAlert \/>/);
});

test('UC05 waveform and review regions use responsive heights with a readable minimum plot area', () => {
  const workspace = read('src/components/modules/uc05/RespiratoryIntelligenceWorkspace.tsx');
  const capnogram = read('src/components/modules/uc05/CapnogramPanel.tsx');
  const pleth = read('src/components/modules/uc05/PlethysmographPanel.tsx');
  const trend = read('src/components/modules/uc05/TrendWorkspace.tsx');
  const review = read('src/components/modules/uc05/BottomReviewGrid.tsx');
  assert.doesNotMatch(workspace, /min-h-\[910px\]/);
  assert.match(workspace, /uc05-workspace-layout/);
  assert.match(capnogram, /uc05-capnogram-panel/);
  assert.match(pleth, /uc05-pleth-panel/);
  assert.match(trend, /uc05-trend-workspace/);
  assert.match(review, /uc05-bottom-review/);
  assert.match(styles, /\.uc05-capnogram-panel[\s\S]*?height:\s*clamp\(148px/);
});

test('UC05 trend rows scale to the available height so the synchronized time badge stays inside its panel', () => {
  const trend = read('src/components/modules/uc05/TrendWorkspace.tsx');
  assert.equal((trend.match(/uc05-trend-track-row/g) || []).length, 6);
  assert.match(styles, /\.uc05-trend-track-row\s*\{[^}]*height:\s*clamp\(42px,\s*5\.4vh,\s*58px\)/);
  assert.match(trend, /flex-1 min-h-0 flex flex-col justify-between py-0 relative/);
  assert.doesNotMatch(trend, /className="absolute top-1\/2[^\"]*pointer-events-none/);
});

test('UC05 numeric and alert rail fits the short workstation layout without clipping alerts', () => {
  const rail = read('src/components/modules/uc05/ClinicalSummaryRail.tsx');
  assert.match(rail, /uc05-summary-rail/);
  assert.match(rail, /uc05-vital-tile/);
  assert.match(rail, /uc05-risk-card/);
  assert.match(rail, /uc05-current-alert/);
  assert.match(styles, /\.uc05-vital-tile[\s\S]*?height:\s*clamp\(86px/);
});

test('UC05 active safety alert is placed before supporting vital cards', () => {
  const rail = read('src/components/modules/uc05/ClinicalSummaryRail.tsx');
  assert.match(rail, /const isAlertActive = activeAlert !== null && activeAlert\.isActive/);
  assert.match(rail, /isAlertActive && <CurrentRespiratoryAlert/);
});

test('UC05 Vietnamese model and status labels wrap without colliding with clinical values', () => {
  const rail = read('src/components/modules/uc05/ClinicalSummaryRail.tsx');
  assert.match(rail, /block whitespace-normal break-words/);
  assert.match(rail, /whitespace-nowrap/);
  assert.match(rail, /min-w-0 break-words leading-tight/);
});

test('UC03 add-medication action keeps its full localized label visible', () => {
  const source = read('src/components/modules/uc03/ActiveMedicationPanel.tsx');
  assert.match(source, /whitespace-nowrap/);
  assert.match(source, /shrink-0/);
  assert.match(source, /min-h-9 h-auto/);
});

test('UC02 workspace minimum width stays inside the module viewport at 1280px', () => {
  const source = read('src/components/modules/uc02/UC02Workspace.tsx');
  assert.match(source, /min-w-\[1160px\]/);
  assert.doesNotMatch(source, /min-w-\[1180px\]/);
});

test('UC02 timeline labels adapt their tick interval to available plot width', () => {
  const source = read('src/components/modules/uc02/ClinicalTimeline.tsx');
  assert.match(source, /axisLabelStep/);
  assert.match(source, /useState\(3\)/);
  assert.match(source, /index % axisLabelStep === 0 \|\| index === timeTicks\.length - 1/);
});
