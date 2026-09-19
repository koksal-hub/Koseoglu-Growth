import { describe, expect, it } from 'vitest';
import { generateManagementReport, getCurrentReportDate, REPORT_TIMEZONE } from '../src/lib/reporting';

const reportDate = getCurrentReportDate();

describe('management report concurrency', () => {
  it('serialises concurrent snapshot writes with P2034 retry instead of a spurious failure', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => generateManagementReport(reportDate))
    );

    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.report.reportKey).toBe(`${reportDate}:${REPORT_TIMEZONE}`);
    }
  });
});