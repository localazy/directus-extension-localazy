import fse from 'fs-extra';

const assureConfig = () => {
  const configExists = fse.existsSync('./extensions/common/config/config.json');
  if (!configExists) {
    fse.copyFileSync('./extensions/common/config/config.production.json', './extensions/common/config/config.json');
  }
};

assureConfig();
