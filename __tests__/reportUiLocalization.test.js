import { buildReportText } from '../src/utils/reportTemplates';

test('localized editor labels do not change canonical report fields or entered values', () => {
  const fields = Object.freeze([
    Object.freeze({ key: 'incident', label: 'INCIDENT NAME', uiLabelKey: 'incident.name' }),
    Object.freeze({ key: 'resources', label: 'RESOURCES ASSIGNED', uiLabelKey: 'incident.resources' }),
  ]);
  const values = Object.freeze({ incident: 'Đội cứu hộ', resources: 'หน่วย 2' });
  const translations = {
    'incident.name': 'TÊN SỰ CỐ',
    'incident.resources': 'NGUỒN LỰC ĐƯỢC PHÂN CÔNG',
    'reportFields.ics201.incident.label': 'TÊN SỰ CỐ',
    'reportFields.ics201.resources.label': 'NGUỒN LỰC ĐƯỢC PHÂN CÔNG',
    'reportCorrections.draftLabel': 'BẢN NHÁP',
  };
  const t = jest.fn(key => translations[key] || key);

  const result = buildReportText({ title: 'ICS 201', fields, values, t });

  expect(result).toContain('INCIDENT NAME: Đội cứu hộ');
  expect(result).toContain('RESOURCES ASSIGNED: หน่วย 2');
  expect(result).not.toContain('TÊN SỰ CỐ');
  expect(result).not.toContain('NGUỒN LỰC ĐƯỢC PHÂN CÔNG');
  expect(t).not.toHaveBeenCalledWith('incident.name');
  expect(t).not.toHaveBeenCalledWith('incident.resources');
});
