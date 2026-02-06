import pkg from 'sonarqube-scanner';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const scanner = pkg.default;

scanner(
  {
    serverUrl: 'http://localhost:9000',
    options: {
      'sonar.login': process.env.SONAR_TOKEN,
      'sonar.projectKey': '42-lms',
      'sonar.projectName': '42 LMS',
      'sonar.projectVersion': '1.0.0',
      'sonar.projectBaseDir': path.resolve(process.cwd(), '..'),
      'sonar.working.directory': path.resolve(process.cwd(), '../.scannerwork'),
      'sonar.sources': 'backend/src,frontend/public/js,scripts',
      'sonar.inclusions': 'backend/src/**/*.ts,frontend/public/js/**/*.js,scripts/**/*.sh',
      'sonar.exclusions': 'data/**/*,backend/node_modules/**/*,backend/dist/**/*,**/*.test.ts,**/*.spec.ts',
      'sonar.projectExclusions': 'data/**/*',
      'sonar.coverage.exclusions': '**/*',
      'sonar.scm.disabled': 'true',
    },
  },
  () => process.exit()
);
