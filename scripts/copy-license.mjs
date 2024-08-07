import fse from 'fs-extra';

const copy = () => {
  fse.copyFileSync('./LICENSE', './extensions/module/LICENSE');
  fse.copyFileSync('./LICENSE', './extensions/sync-hook/LICENSE');
};

copy();
