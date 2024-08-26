import { getLocalazyLanguages } from '@localazy/languages';
import fse from 'fs-extra';

/** '@localazy/languages' exports JSON overview of all languages supported by Localazy.
 * However, Directus is unable to parse JSON files in the rollup pipeline.
 * Therefore, we need to generate a TypeScript file with the same content while excluding the JSON file.
 */
const generateLocalazyLanguages = async () => {
  const languageType = fse.readFileSync('node_modules/@localazy/languages/lib/module/language.d.ts');
  let template = `/* eslint-disable */\n${languageType.toString()}\n\n`;

  template += 'export const getLocalazyLanguages = (): Language[] => {\n return [\n';
  template += getLocalazyLanguages().map((language) => `  ${JSON.stringify(language)},`).join('\n');
  template += ' ]};\n';

  fse.writeFileSync('./extensions/common/functions/localazy-languages.ts', template);
};

generateLocalazyLanguages();
