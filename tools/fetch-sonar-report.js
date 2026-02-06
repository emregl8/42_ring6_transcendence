import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const SONAR_URL = 'http://localhost:9000';
const PROJECT_KEY = '42-lms';
const SONAR_TOKEN = process.env.SONAR_TOKEN;

if (!SONAR_TOKEN) {
  console.error('SONAR_TOKEN is not defined in .env');
  process.exit(1);
}

const AUTH = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');

async function fetchIssues() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const severities = 'INFO,MINOR,MAJOR,CRITICAL,BLOCKER';
    const response = await fetch(`${SONAR_URL}/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&ps=500&severities=${severities}`, {
      headers: {
        Authorization: `Basic ${AUTH}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: ${response.statusText}`);
    }

    const data = await response.json();
    let report = `SONARQUBE ANALYSIS REPORT - ${new Date().toISOString()}\n`;
    report += `Project: ${PROJECT_KEY}\n`;
    report += `Total Issues: ${data.total}\n`;
    report += `================================================================================\n\n`;

    if (data.issues && data.issues.length > 0) {
      data.issues.forEach((issue, index) => {
        report += `${index + 1}. [${issue.severity}] [${issue.type}] [${issue.rule}]\n`;
        report += `   File: ${issue.component}\n`;
        report += `   Line: ${issue.line || 'N/A'}\n`;
        report += `   Message: ${issue.message}\n`;
        report += `   Link: ${SONAR_URL}/project/issues?id=${PROJECT_KEY}&open=${issue.key}\n`;
        report += `--------------------------------------------------------------------------------\n`;
      });
    } else {
      report += 'No issues found! Great job.\n';
    }

    fs.writeFileSync(path.join(process.cwd(), 'sonar_report.txt'), report);
  } catch (error) {
    console.error('Error creating report:', error.message);
    process.exit(1);
  }
}

fetchIssues();
