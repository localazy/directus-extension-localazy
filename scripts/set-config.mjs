import fs from 'fs';

const setConfig = () => {
  const mode = process.argv.find((arg) => arg.includes('mode='));
  if (mode && mode.includes('production')) {
    fs.copyFileSync('./extensions/common/config/config.production.json', './extensions/common/config/config.json');
  }
  if (mode && mode.includes('demo')) {
    fs.copyFileSync('./extensions/common/config/config.demo.json', './src/common/config/config.json');
  }
};

setConfig();
