import { emptyIncidentState, beginIncidentDetails, keepIncidentEditor, beginIncidentEntry } from '../../src/utils/incident';
export const NOW = Date.UTC(2026,9,17,12,0);
export function incidentFixture() {
  let state=beginIncidentDetails(emptyIncidentState());
  state.editor.value={...state.editor.value,name:'SYNTHETIC INCIDENT QA',number:'QA-214',from:'2026-10-17 07:00 -04:00',to:'2026-10-17 19:00 -04:00',resource:'FIELD TEAM 1',person:'A. Example',position:'Observer',agency:'Training team',preparer:'A. Example',preparerPosition:'Observer',resources:[{name:'J. Example',position:'Observer',agency:'Training team'}]};
  state=keepIncidentEditor(state,NOW);
  state=beginIncidentEntry(state,{now:NOW});state.editor.text='Synthetic activity: checked the staging access.';
  return keepIncidentEditor(state,NOW+1000);
}
