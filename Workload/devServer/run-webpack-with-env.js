const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const environment = process.argv[2] || 'dev';
const workloadRoot = path.resolve(__dirname, '..');

const preferredFileByEnvironment = {
    dev: '.env.dev',
    test: '.env.test',
    prod: '.env.prod',
};

const preferredFile = preferredFileByEnvironment[environment] || '.env.dev';
const envCandidates = [preferredFile, '.env.dev', '.env.template'];
const selectedEnvFile = envCandidates.find((file) => fs.existsSync(path.join(workloadRoot, file)));

if (!selectedEnvFile) {
    console.error('[Build] No environment file found. Expected one of: .env.dev, .env.test, .env.prod, .env.template');
    process.exit(1);
}

if (selectedEnvFile !== preferredFile) {
    console.warn(`[Build] ${preferredFile} not found. Falling back to ${selectedEnvFile}.`);
}

const parsedEnv = dotenv.parse(fs.readFileSync(path.join(workloadRoot, selectedEnvFile)));
for (const [key, value] of Object.entries(parsedEnv)) {
    if (process.env[key] === undefined) {
        process.env[key] = value;
    }
}

const webpackArgs = ['--config', './webpack.config.js', '--output-path', '../build/Frontend'];
if (environment === 'prod') {
    webpackArgs.push('--mode', 'production', '--progress');
} else {
    webpackArgs.push('--mode', 'development', '--progress');
}

const webpackExecutable = process.platform === 'win32'
    ? path.join(workloadRoot, 'node_modules', '.bin', 'webpack.cmd')
    : path.join(workloadRoot, 'node_modules', '.bin', 'webpack');

const result = spawnSync(
    webpackExecutable,
    webpackArgs,
    {
        cwd: workloadRoot,
        env: process.env,
        stdio: 'inherit',
        shell: true,
    }
);

if (result.error) {
    console.error('[Build] Failed to execute webpack:', result.error.message);
}

process.exit(result.status ?? 1);