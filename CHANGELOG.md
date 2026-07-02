# Changelog

## 2.2.0 (2026-07-02)

### 🔀 Merged Pull Requests
- ✨ feat: support Directus 12 [#110](https://github.com/localazy/directus-extension-localazy/pull/110)

### ✨ Features
- support Directus 12 (*[bb8483d](https://github.com/localazy/directus-extension-localazy/commit/bb8483d15173f4cc75e9c4e241177329fb479e27)*) (*[#110](https://github.com/localazy/directus-extension-localazy/pull/110)*)

### ❤️ Contributors
- [*Daniel Charvat*](https://github.com/elisiondan)

## 2.1.0 (2026-06-22)

### 🔀 Merged Pull Requests
- ✨ feat: harden import sync and improve Directus error reporting [#108](https://github.com/localazy/directus-extension-localazy/pull/108)

### ✨ Features
- terminate a stuck sync session from the Activity detail page (*[f94cae2](https://github.com/localazy/directus-extension-localazy/commit/f94cae22151a1ecb3394b8de16e752bf4483545a)*) (*[#108](https://github.com/localazy/directus-extension-localazy/pull/108)*)
- aggregate Directus import errors into expandable rows with deep-links (*[8199322](https://github.com/localazy/directus-extension-localazy/commit/8199322822b6e20c63bd74ca0c8861e6c4dabdd4)*) (*[#108](https://github.com/localazy/directus-extension-localazy/pull/108)*)

### 🐛 Bug Fixes
- render action-button tooltips below the page header (*[3409a28](https://github.com/localazy/directus-extension-localazy/commit/3409a287407128ca0dcc22424ca76b18a01999e5)*) (*[#108](https://github.com/localazy/directus-extension-localazy/pull/108)*)
- skip Localazy languages missing from Directus on import (*[e8f7045](https://github.com/localazy/directus-extension-localazy/commit/e8f704585f41cbeb59f90d316468317c2eb70619)*) (*[#108](https://github.com/localazy/directus-extension-localazy/pull/108)*)
- stop the download cursor overflowing its column (*[910114b](https://github.com/localazy/directus-extension-localazy/commit/910114b5bf90986ef0bd7f02f684330d19d3a34c)*) (*[#108](https://github.com/localazy/directus-extension-localazy/pull/108)*)

### ❤️ Contributors
- [*Daniel Charvat*](https://github.com/elisiondan)

## 2.0.0 (2026-06-09)

### 🔀 Merged Pull Requests
- 🐛 fix: allow sqlite3 native build so pnpm dev boots Directus [#107](https://github.com/localazy/directus-extension-localazy/pull/107)
- 🔧 chore: monorepo migration — release CLI, pnpm, packages/* + Turborepo [#104](https://github.com/localazy/directus-extension-localazy/pull/104)
- 📚 docs: backfill 2.0.0 release section in CHANGELOG [#100](https://github.com/localazy/directus-extension-localazy/pull/100)
- Prepare for bump [#99](https://github.com/localazy/directus-extension-localazy/pull/99)
- chore(deps): bump sync-hook axios to ^1.15.2 (covers 9 CVEs) [#98](https://github.com/localazy/directus-extension-localazy/pull/98)
- chore: make .husky/pre-commit executable [#97](https://github.com/localazy/directus-extension-localazy/pull/97)
- ci: bump deprecated v4 actions to v6 + lint cleanup [#95](https://github.com/localazy/directus-extension-localazy/pull/95)
- Release: next → main (75 PRs since v1.0.10 / v1.1.0) [#93](https://github.com/localazy/directus-extension-localazy/pull/93)

### 🐛 Bug Fixes
- allow sqlite3 native build so pnpm dev boots Directus (*[c35c713](https://github.com/localazy/directus-extension-localazy/commit/c35c713a0610c6a29b13b8ec8252e291e23bd6e5)*) (*[#107](https://github.com/localazy/directus-extension-localazy/pull/107)*)
- set display_template on seeded languages collection (*[6fc6147](https://github.com/localazy/directus-extension-localazy/commit/6fc6147ffee88293c2e736d6021dfc7bcdb8b0c1)*) (*[#107](https://github.com/localazy/directus-extension-localazy/pull/107)*)
- hide languages_code field on articles_translations from per-row form (*[8ed1313](https://github.com/localazy/directus-extension-localazy/commit/8ed1313b125cfd6c467d19ceb7c49d05a3194e7f)*) (*[#107](https://github.com/localazy/directus-extension-localazy/pull/107)*)
- pre-configure articles fields as translatable in seed script (*[392a7af](https://github.com/localazy/directus-extension-localazy/commit/392a7af4ac3c0ba20a15019a6373419a302bd625)*) (*[#107](https://github.com/localazy/directus-extension-localazy/pull/107)*)

### 📚 Documentation
- backfill 2.0.0 release section in CHANGELOG (*[5ecbdee](https://github.com/localazy/directus-extension-localazy/commit/5ecbdee1c82843181c0fd68cb7427e55ebebe967)*) (*[#100](https://github.com/localazy/directus-extension-localazy/pull/100)*)

### 🧰 Other Commits
- **ci:** adopt lockstep release flow via @localazy/workflow-scripts (#101) (*[ab80cf2](https://github.com/localazy/directus-extension-localazy/commit/ab80cf266df684eaa01e0f2199f3df583ee615b9)*) (*[#104](https://github.com/localazy/directus-extension-localazy/pull/104)*)
- migrate from npm workspaces to pnpm (#102) (*[46113b5](https://github.com/localazy/directus-extension-localazy/commit/46113b572825011fe7d0b3c9e03a7fc8547d9f7a)*) (*[#104](https://github.com/localazy/directus-extension-localazy/pull/104)*)
- restructure to packages/ + Turborepo + @localazy/directus-common (#103) (*[eb134c1](https://github.com/localazy/directus-extension-localazy/commit/eb134c1bdc2a552187ba7f9c46af917eb402d466)*) (*[#104](https://github.com/localazy/directus-extension-localazy/pull/104)*)
- tighten pre-commit autofix + clarify Vue override rationale (#105) (*[fa260d1](https://github.com/localazy/directus-extension-localazy/commit/fa260d1a4cb3562f88acae160b5127ef8649d78a)*) (*[#104](https://github.com/localazy/directus-extension-localazy/pull/104)*)
- bundle README images instead of hot-linking from Directus host (*[121c7e9](https://github.com/localazy/directus-extension-localazy/commit/121c7e900cba0e5698167a0860e20328e76e1956)*) (*[#99](https://github.com/localazy/directus-extension-localazy/pull/99)*)
- **deps:** bump sync-hook axios to ^1.15.2 (covers 9 CVEs) (*[3706df1](https://github.com/localazy/directus-extension-localazy/commit/3706df1aa56e0f4b39278fe168951d902c8aa6d8)*) (*[#98](https://github.com/localazy/directus-extension-localazy/pull/98)*)
- make .husky/pre-commit executable (*[c49dc78](https://github.com/localazy/directus-extension-localazy/commit/c49dc780871d8b5a89fdce880bfb302f352077e9)*) (*[#97](https://github.com/localazy/directus-extension-localazy/pull/97)*)
- bump deprecated v4 actions to v6 + lint cleanup (*[57c5706](https://github.com/localazy/directus-extension-localazy/commit/57c57068d334c90af80ce684aca406c7a301ac15)*) (*[#95](https://github.com/localazy/directus-extension-localazy/pull/95)*)
- PR 1/N (2.0 stack): npm workspaces + Node 22 + SQLite dev (*[4dcb292](https://github.com/localazy/directus-extension-localazy/commit/4dcb292958fc31b76d15da5c4801787615e0abe2)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 2/N (2.0 stack): ESLint 10 flat config + Prettier + production-build CI gate (*[d73d167](https://github.com/localazy/directus-extension-localazy/commit/d73d167c85b36d434c985916447bec8ee2db2043)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- add CLAUDE.md for AI assistants (*[4376473](https://github.com/localazy/directus-extension-localazy/commit/43764736fcb8cc4840f36a4bda3d4f7e0744f8b9)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 3/N (2.0 stack): Vitest scaffold + tests for utilities and hook sync service (*[d141f0f](https://github.com/localazy/directus-extension-localazy/commit/d141f0fbb447cafc2ce876b3aa42a9c4bc9e48d3)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 4/N (2.0 stack): @directus/extensions-sdk 12 → 17, host range ^11, drop Directus 10 shim (*[0f81402](https://github.com/localazy/directus-extension-localazy/commit/0f81402a107137c7b9e194a8949ae0786e877098)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 5/N (2.0 stack): align Vue ecosystem deps with SDK 17, add extension compatibility tables (*[67a7a3a](https://github.com/localazy/directus-extension-localazy/commit/67a7a3a8e2f090908147d3518f1c3e9d41618403)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 6/N (2.0 stack): MIGRATION.md, safe dep bumps, BREAKING CHANGE marker for the 2.0 release (*[421387f](https://github.com/localazy/directus-extension-localazy/commit/421387f756933d3c86266091d4b5f06d2d7699bf)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 7/N (2.0 stack): aggregate check script + husky pre-commit, drop MIGRATION.md (*[cce50b9](https://github.com/localazy/directus-extension-localazy/commit/cce50b964ab0855ffcb7ca4dcb90100b5a851849)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 8/N (2.0 stack): knip + coverage + no-explicit-any rule (*[7e07db2](https://github.com/localazy/directus-extension-localazy/commit/7e07db241bb20ae9a9e774ba434602e97ea10f4d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 9/N (Stage 2): move async queue to common + trivial cleanups (*[adfec80](https://github.com/localazy/directus-extension-localazy/commit/adfec80a2d5eb0b2f5199ef1502377bcb450b80b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 10/N (Stage 2): clear typecheck errors and gate typecheck in CI (*[eeb71d8](https://github.com/localazy/directus-extension-localazy/commit/eeb71d82e71ff17b3972d9a8610edf0149d343a1)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 11/N (Stage 2): fix sync-hook missing await + consolidate handlers + explicit accountability + Promise lint rule (*[c529856](https://github.com/localazy/directus-extension-localazy/commit/c5298568e45c9b1c591a9171f470e82f9ee64416)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 12/N (Stage 2): typed Directus service constructors + fix latent resolveExportLanguages bug (*[5f7d38e](https://github.com/localazy/directus-extension-localazy/commit/5f7d38eb159b09c8ff59433bcaa23dda900f41f5)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 13/N (Stage 2): polish bundle — hook README, common pkg description, sandbox note, husky nvm fix (*[537704a](https://github.com/localazy/directus-extension-localazy/commit/537704a66ed76c9a0ce2eb194a95df776799315f)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 14/N (Stage 2): triage floating-promise sites, fix real bug, promote rule to error (*[7e8f1eb](https://github.com/localazy/directus-extension-localazy/commit/7e8f1eb3adf05fecd2df5f390922f252db9f5b93)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 15/N (Stage 2): bump @localazy/generic-connector-client 0.2 → 0.4 (drop-in) (*[c915a9c](https://github.com/localazy/directus-extension-localazy/commit/c915a9c36d0dd585677ff93907054da929b49c42)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 16/N (Stage 2): bump @localazy/languages 1 → 2 (drop-in) (*[431a374](https://github.com/localazy/directus-extension-localazy/commit/431a3749761a89ed6e530e24196e979ed6a0b5a1)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 17/N (Stage 2): eliminate no-explicit-any baseline (68 → 0), promote rule to error (*[3f8e161](https://github.com/localazy/directus-extension-localazy/commit/3f8e161259b6092ab219109e1fdbd3ca8861325c)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 18/N (Stage 2): integrate community PR #21 language-mapping feature (#40) (*[2533bef](https://github.com/localazy/directus-extension-localazy/commit/2533bef3a533eaf6ab2cac73cb86d896192b0b2d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 19/N (Stage 2): fix UUID PK comparison + dynamic language FK resolution (#41) (*[c5401ed](https://github.com/localazy/directus-extension-localazy/commit/c5401eda8c597abd5df9618c9857c7da693aaf71)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 20/N (Stage 3): use private-view title/icon props instead of hand-rolled slots (#42) (*[35f2ba9](https://github.com/localazy/directus-extension-localazy/commit/35f2ba9bee4bbf4623d12231fc33b38d10c38420)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 21/N (Stage 3): split useHydrate into installer + per-singleton stores (#43) (*[2d075c7](https://github.com/localazy/directus-extension-localazy/commit/2d075c72b4494d6555b05752b8d1360393d989f1)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 22/N (Stage 3): useSingletonForm composable; refactor AdvancedSettings + ProjectSetup (#44) (*[6b3c2d0](https://github.com/localazy/directus-extension-localazy/commit/6b3c2d0453303b042f73cdf7b41d5b991256bbba)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 23/N (Stage 3): DirectusModuleApi class + slim DirectusApi interface (#45) (*[596a61f](https://github.com/localazy/directus-extension-localazy/commit/596a61ff53d91390122f62297740041574cf1b90)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 24/N (Stage 3): composable audit pass (#46) (*[655b42b](https://github.com/localazy/directus-extension-localazy/commit/655b42bccf365a86bd39f61911a3811c5284d881)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 25/N (Stage 3): reactivity pattern standardization (#47) (*[9de7b01](https://github.com/localazy/directus-extension-localazy/commit/9de7b01ba8a3896bb970c4c91547837d0e46bcb4)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 26/N (Stage 3+): useLocalazyBoot + defineModel adoption + sync-flow cleanups (#48) (*[60ee783](https://github.com/localazy/directus-extension-localazy/commit/60ee78388d499ab72842dac201a3c94b3a49424b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 27/N (Stage 3++): final review cleanup (#49) (*[5c2d57c](https://github.com/localazy/directus-extension-localazy/commit/5c2d57c552bc6033b40fbc4cb87f94ae4ad953dc)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 29/N: dev environment cleanup (sass, log levels, schema defaults, seed) (#51) (*[6755817](https://github.com/localazy/directus-extension-localazy/commit/6755817e5f021ad9412d78217b57c0afadf854f4)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 30/N (Stage 4): incremental download sync (#52) (*[d390ca8](https://github.com/localazy/directus-extension-localazy/commit/d390ca867592bfb89b2974a52a4b20ea0be7ffce)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 31/N (Stage 4): incremental upload sync (#53) (*[54852a9](https://github.com/localazy/directus-extension-localazy/commit/54852a958388e3b60e1944d59001e4fa64b2707d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 28/N: split CONTRIBUTING.md out of README; fix module README typo (#50) (*[337e0db](https://github.com/localazy/directus-extension-localazy/commit/337e0db39375677949708693f5d93a9ae484be3f)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 32/N (Stage 5): convert sync-hook to bundle (#54) (*[7928180](https://github.com/localazy/directus-extension-localazy/commit/79281807ae2ab0c0170199b3df20cb9f4ed5aba3)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 33/N (Stage 5): lift incremental-import orchestrator to common (#55) (*[e6d0b8f](https://github.com/localazy/directus-extension-localazy/commit/e6d0b8f64a0c1079a2241a24eaab5ac45f3a2fc2)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 34/N (Stage 5): advisory sync lock + heartbeat + dirty-bit re-fire (#56) (*[eb5ef40](https://github.com/localazy/directus-extension-localazy/commit/eb5ef40608afe6bd5b03fc7e004f70ed3939e291)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 35/N (Stage 5): localazy_sync_log collection + Activity page (#57) (*[959ebe5](https://github.com/localazy/directus-extension-localazy/commit/959ebe5d8a4f49a3a16ee6a6f1bfd0b41ba7c958)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 36/N (Stage 5): Automation page + WebhookSetup + settings fields (#58) (*[51f0549](https://github.com/localazy/directus-extension-localazy/commit/51f0549643231a6ae6ab0310ae772ee17e020992)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 37/N (Stage 5): inbound webhook handler — HMAC verification + gating + orchestrator dispatch (#59) (*[58c74b8](https://github.com/localazy/directus-extension-localazy/commit/58c74b88cff692bea5d4572a0fadae16d284a23d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 38/N (Stage 5): failure notifications + dedupe + UX polish (final) (#60) (*[7226ab0](https://github.com/localazy/directus-extension-localazy/commit/7226ab034617fa8efc87376ad2057db3c15d8664)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 39/N: docs — CONTEXT.md glossary + ADR-0001 (#61) (*[03f1adc](https://github.com/localazy/directus-extension-localazy/commit/03f1adcd23fb015abde00256804fe5af10d9968b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 40/N: fix Admin-user filter for Directus 11 (#62) (*[990e5c4](https://github.com/localazy/directus-extension-localazy/commit/990e5c43daffab83a8ea4a45570590ea8a1b1f81)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 41/N (Stage 5+): move sync master toggles to Automation page (ADR-0001) (#63) (*[ca1ed25](https://github.com/localazy/directus-extension-localazy/commit/ca1ed2588e9e23cf3b014630f7318ff2a4e8362b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 42/N: SHA-256 fallback for non-secure-context browsers (#64) (*[1864d07](https://github.com/localazy/directus-extension-localazy/commit/1864d0769959a38d6bc22be7190f2884e758d9c6)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 43/N: language-display utility + v-select LanguageMappingsEditor (#65) (*[7fdcc3c](https://github.com/localazy/directus-extension-localazy/commit/7fdcc3c4ea7cbe8ed884957b33b36eb485ffafbe)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 44/N: Overview page UI redesign (#66) (*[c14b11d](https://github.com/localazy/directus-extension-localazy/commit/c14b11df2be6a08803af3f1662ab34bdfb32dbad)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 45/N (Stage 5): upload-path sync-log writer + adapter setup-scope fix (#67) (*[50fc008](https://github.com/localazy/directus-extension-localazy/commit/50fc008df08c952b8d9f8a0033618e092d5b5136)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 46/N (Stage 5): Activity page filters + initiator name resolution (#68) (*[10298b7](https://github.com/localazy/directus-extension-localazy/commit/10298b7ecd18ac2fbe325570d546b334a6b7f4c8)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 47/N (Stage 5, final): About page rewrite + navigation reorder (#69) (*[ca55835](https://github.com/localazy/directus-extension-localazy/commit/ca558354e67f14817931b6847bd9594d6ae37dea)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 48/N: deep Sync-log writer foundation in common/ (*[7a027ff](https://github.com/localazy/directus-extension-localazy/commit/7a027ff9933aa672d8c2ee181a112d1e55c879b0)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 49/N: cut Module + Sync-hook bundle over to deep Sync-log writer (*[6f4961d](https://github.com/localazy/directus-extension-localazy/commit/6f4961d9eea4025d715b92a7fc7b6dd497af1e4d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 50/N: incremental-export-orchestrator foundation (module-side) (*[c0ef288](https://github.com/localazy/directus-extension-localazy/commit/c0ef2886e9c34bc17cb962ca1efe9d881186bfac)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 51/N: cut useSyncContainerActions over to the export orchestrator (*[d1a0ae5](https://github.com/localazy/directus-extension-localazy/commit/d1a0ae50cfe3637a448910e72caa491bd0b4469b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 52/N: Automated export + deprecation pipeline foundation (#70) (*[fae14be](https://github.com/localazy/directus-extension-localazy/commit/fae14befcb4b6b97cb48b4df526b796a569d6d7a)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 53/N: cut hook over to Automated export + deprecation pipelines (#71) (*[2f9c3ff](https://github.com/localazy/directus-extension-localazy/commit/2f9c3ffbcde1269d888bce6034ecd972623ca431)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 54/N: cleanup follow-ups from PR 53 review (#72) (*[fd207b8](https://github.com/localazy/directus-extension-localazy/commit/fd207b87745d1c7586a97e7ddfeaa3f1bfb07e54)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 55/N: useSyncLogEntries composable for Activity detail page (#73) (*[06d852f](https://github.com/localazy/directus-extension-localazy/commit/06d852f02e23df6843c558bea3536fd988dcc79f)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 56/N: migrate styles to Directus 11 theme-token namespace (#74) (*[0b353af](https://github.com/localazy/directus-extension-localazy/commit/0b353affc7949686e0a8756860a83be7c11cd071)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 57/N: heal-fields utility + meta.special drift PATCH (#75) (*[9ac2a50](https://github.com/localazy/directus-extension-localazy/commit/9ac2a50779223f9c3108f2df7fd1cd9b62376b5d)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 58/N: useUnsavedChangesGuard + wire into the three settings pages (#76) (*[29cb6fc](https://github.com/localazy/directus-extension-localazy/commit/29cb6fc23d61b7e22406a0b5c1ac43cefab5815a)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 59/N: LanguageMappingsEditor — always-editable rows + valid model (#77) (*[a4b753b](https://github.com/localazy/directus-extension-localazy/commit/a4b753b57d8ee5a143a35dcfa1b02810fc33d406)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 60/N: Overview language table — Directus column first + inline mapping (#78) (*[e9736ba](https://github.com/localazy/directus-extension-localazy/commit/e9736bafc59c80412cf77be6c27bb306049de9cc)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 61/N: sync-log milestone entries for the incremental export orchestrator (#79) (*[d4f55d7](https://github.com/localazy/directus-extension-localazy/commit/d4f55d7fdf56a6ae7f6c844e2bfaf6861229cf54)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 62/N: burst-coalescing design docs + pipeline outcome counts (#80) (*[8ff9093](https://github.com/localazy/directus-extension-localazy/commit/8ff909382d6a167a55b0630be484bc393b93a9f8)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 63/N: extract server SyncLogStorage adapter to shared/ (#81) (*[7c4f9d4](https://github.com/localazy/directus-extension-localazy/commit/7c4f9d4341ba1b20da64ceb6aa3b929f439d92d0)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 64/N: burst coordinator + hook handler integration (#82) (*[817a846](https://github.com/localazy/directus-extension-localazy/commit/817a84633dd0aa3f6dfa7205cee5d2812d713849)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 65/N: surface burst sessions on the Activity page (#83) (*[e8aa00b](https://github.com/localazy/directus-extension-localazy/commit/e8aa00b9894acca88e223d5598efdfb452456dc8)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 66/N: cleanup follow-ups from the burst-coordinator review (#84) (*[00fe1de](https://github.com/localazy/directus-extension-localazy/commit/00fe1de5ea60e92ed7b83d069bdb59a4e9a6f85c)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 67/N: Activity page → 2 tabs + Triggered by filter (#85) (*[770793c](https://github.com/localazy/directus-extension-localazy/commit/770793c0eb2dd22b8edce9f6960e1016cce4e33c)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 68/N: fix webhook hang + Directus 11 admin gate (#86) (*[ea74715](https://github.com/localazy/directus-extension-localazy/commit/ea7471523910d2306885086a94e9def785b7f226)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 69/N: search lens for the Import & Export tree (#87) (*[20c833d](https://github.com/localazy/directus-extension-localazy/commit/20c833d342d37fa6f82f6dd40214910751eaa204)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 70/N: tree search — reveal whole subtree under a name-matched collection (#88) (*[ebc1b8b](https://github.com/localazy/directus-extension-localazy/commit/ebc1b8b0cbf0824ed3de225748a75437ed5cac7c)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 71/N: lift Sync-page option-row contrast on dark mode (#89) (*[3600d3b](https://github.com/localazy/directus-extension-localazy/commit/3600d3b2692e8679344f186694bc8808a83a6826)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 72/N: dark-mode readability sweep across module pages (#90) (*[d9b3a38](https://github.com/localazy/directus-extension-localazy/commit/d9b3a384025407b91de010f968db28543c3f2df5)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 73/N: fix two fresh-install UX bugs surfaced during first-time setup (#91) (*[124a493](https://github.com/localazy/directus-extension-localazy/commit/124a493e2c1f0ffaf9abedf4e9d627397fb0fe3b)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)
- PR 74/N: route bundle error tracking through the Directus logger (#92) (*[e306d3c](https://github.com/localazy/directus-extension-localazy/commit/e306d3cfe83e1fddad7d35d72367df2a47df3922)*) (*[#93](https://github.com/localazy/directus-extension-localazy/pull/93)*)

### ❤️ Contributors
- [*Daniel Charvat*](https://github.com/elisiondan)

# 2.0.0 (2026-05-20)
### 🔀 Pull Requests

- [bundle README images instead of hot-linking from Directus host #99](https://github.com/localazy/directus-extension-localazy/pull/99)
- [bump sync-hook axios to ^1.15.2 (covers 9 CVEs) #98](https://github.com/localazy/directus-extension-localazy/pull/98)
- [make .husky/pre-commit executable #97](https://github.com/localazy/directus-extension-localazy/pull/97)
- [bump deprecated v4 actions to v6 + lint cleanup #95](https://github.com/localazy/directus-extension-localazy/pull/95)
- [next → main (75 PRs since v1.0.10 / v1.1.0) #93](https://github.com/localazy/directus-extension-localazy/pull/93)
- [backfill 2.0.0 release section in CHANGELOG #100](https://github.com/localazy/directus-extension-localazy/pull/100)

### 💥 Breaking Changes

- bundle README images instead of hot-linking from Directus host ([a539dd5](https://github.com/localazy/directus-extension-localazy/commit/a539dd5)) ([#99](https://github.com/localazy/directus-extension-localazy/pull/99))

### 📚 Documentation

- backfill 2.0.0 release section in CHANGELOG ([f899020](https://github.com/localazy/directus-extension-localazy/commit/f899020)) ([#100](https://github.com/localazy/directus-extension-localazy/pull/100))

### 🧰 Other Commits

- **deps:** bump sync-hook axios to ^1.15.2 (covers 9 CVEs) ([058e99f](https://github.com/localazy/directus-extension-localazy/commit/058e99f)) ([#98](https://github.com/localazy/directus-extension-localazy/pull/98))
- make .husky/pre-commit executable ([e5bf945](https://github.com/localazy/directus-extension-localazy/commit/e5bf945)) ([#97](https://github.com/localazy/directus-extension-localazy/pull/97))
- bump deprecated v4 actions to v6 + lint cleanup ([5c254bd](https://github.com/localazy/directus-extension-localazy/commit/5c254bd)) ([#95](https://github.com/localazy/directus-extension-localazy/pull/95))
- add CLAUDE.md for AI assistants ([b539f49](https://github.com/localazy/directus-extension-localazy/commit/b539f49)) ([#93](https://github.com/localazy/directus-extension-localazy/pull/93))
- module / build:hook drop --no-minify; new build:{module,hook}:dev keep it for the dev watch loop. qa.yml now runs the minified production build, matching what release publishes. ([b539f49](https://github.com/localazy/directus-extension-localazy/commit/b539f49)) ([#93](https://github.com/localazy/directus-extension-localazy/pull/93))

## 2.0.0 (2026-05-20)

Top-to-bottom modernization of the repo and a large feature push around server-driven sync, plus the UX work to drive it. Bundles 75 PRs landed on `next` since v1.0.10 / v1.1.0 ([#93](https://github.com/localazy/directus-extension-localazy/pull/93)), plus three follow-ups merged directly to `main`.

### 🚀 Headline Changes

- **Toolchain to 2.0** — Node 22, npm workspaces, ESLint 10 flat config, Prettier 3, TypeScript 5.9, Vitest, Directus SDK 17, host range `^11`, husky pre-commit, knip, v8 coverage. CI gates lint + format + typecheck + tests plus a production build on every PR.
- **`sync-hook` is now a Directus bundle** — `defineHook` + `defineEndpoint` packaged together. The endpoint exposes `GET /localazy-automation/status` so the module can detect bundle presence; the hook keeps the `ItemsService`/`FieldsService` callbacks (non-sandboxable by design, `MARKETPLACE_TRUST=all` required for marketplace installs).
- **Server-driven sync** — inbound webhook handler with HMAC verification + admin gating + orchestrator dispatch; incremental download + upload pipelines; advisory sync lock + heartbeat + dirty-bit re-fire; burst coordinator coalescing related events into sessions.
- **Activity page** — new `localazy_sync_log` collection, Export / Import tabs (direction), `Triggered by` filter (Automation / User) with initiator-name resolution, detail page powered by `useSyncLogEntries`. Coalesced `upload-automated` burst sessions render inline in the Export tab.
- **Automation page** — single home for the sync master toggles (per ADR-0001 — previously split across Advanced Settings as `automated_upload` + `automated_deprecation`, with deprecation now a sub-toggle of the Export master). Includes the `WebhookSetup` UI, a README link when the bundle is missing, and bundle errors routed through the Directus logger.
- **UX refresh** — Overview redesign, About rewrite + nav reorder, Import / Export tree search with whole-subtree reveal under a name match, dark-mode pass across module pages, fresh-install bug fixes, language-display utility + v-select language mappings editor (community PR #21 integrated).
- **Architecture deepening** — async queue, deep sync-log writer, and incremental-import orchestrator lifted into `extensions/common/`; module-side incremental-export orchestrator extracted as a foundation; typed Directus service constructors; `DirectusModuleApi` class implementing a slim `DirectusApi` interface; `useSingletonForm`, `useLocalazyBoot`, `useUnsavedChangesGuard`, reactivity pattern standardization.
- **Hardening** — eliminate the `no-explicit-any` baseline (68 → 0, rule promoted to error), triage floating promises (rule promoted to error), fix the webhook hang + Directus 11 admin gate (`admin_access` moved to `directus_policies`), UUID PK comparison fix, dynamic language FK resolution, SHA-256 fallback for non-secure-context browsers (`crypto.subtle` is undefined off HTTPS / `localhost`), `heal-fields` utility + `meta.special` drift PATCH.
- **Docs & dev env** — `CLAUDE.md`, `CONTEXT.md` glossary, `docs/adr/` (incl. ADR-0001 for the master-toggle move), `scripts/dev.mjs` symlinks workspaces under `development/extensions/` to keep `EXTENSIONS_PATH` clean of `extensions/common/`, SQLite + seed script for local data.

**Scope**: 261 files changed, +49,629 / −17,217.

### 🧰 Post-Release Follow-ups

- ⬆️ Bump sync-hook `axios` to ^1.15.2, covering 9 CVEs ([#98](https://github.com/localazy/directus-extension-localazy/pull/98))
- 🔧 Make `.husky/pre-commit` executable ([#97](https://github.com/localazy/directus-extension-localazy/pull/97))
- 🔧 Bump deprecated v4 GitHub Actions to v6 + lint cleanup ([#95](https://github.com/localazy/directus-extension-localazy/pull/95))

## 1.0.10 (2024-12-10)
### 🔀 Pull Requests

- [Update directus plugin for the latest directus version #19](https://github.com/localazy/directus-extension-localazy/pull/19)

### 🐛 Bug Fixes

- Fix initial hydration and data definiton. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Fix preRegisterCheck to work with both old and new user object. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Hydrate plugin sequentially to prevent overloading. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))

### 🧰 Other Commits

- Fix dev build overwriting config file. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Fix docker-compose config for the latest directus version. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Keep fields visible in dev mode. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Move useStores outside of store definition. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))
- Update dependencies. ([d5a72f3](https://github.com/localazy/directus-extension-localazy/commit/d5a72f3)) ([#19](https://github.com/localazy/directus-extension-localazy/pull/19))

## 1.0.9 (2024-08-26)
### 🔀 Pull Requests

- [Fix release #17](https://github.com/localazy/directus-extension-localazy/pull/17)

### 🧰 Other Commits

- Fix invalid package.json ([7713e5d](https://github.com/localazy/directus-extension-localazy/commit/7713e5d)) ([#17](https://github.com/localazy/directus-extension-localazy/pull/17))
- Update monorepo CI ([7713e5d](https://github.com/localazy/directus-extension-localazy/commit/7713e5d)) ([#17](https://github.com/localazy/directus-extension-localazy/pull/17))

## 1.0.8 (2024-08-26)
### 🔀 Pull Requests

- [Update @localazy/languages. #15](https://github.com/localazy/directus-extension-localazy/pull/15)

### 🧰 Other Commits

- Update @localazy/languages. ([900ee5c](https://github.com/localazy/directus-extension-localazy/commit/900ee5c)) ([#15](https://github.com/localazy/directus-extension-localazy/pull/15))

## 1.0.7 (2024-08-07)

### 📚 Documentation

- Add MIT license. ([3ca4c65](https://github.com/localazy/directus-extension-localazy/commit/3ca4c65))

## 1.0.6 (2024-07-31)

### 📚 Documentation

- Update package.json npm data. ([335b345](https://github.com/localazy/directus-extension-localazy/commit/335b345))

## 1.0.5 (2024-07-18)
### 🔀 Pull Requests

- [Bug fixes #8](https://github.com/localazy/directus-extension-localazy/pull/8)

### 🐛 Bug Fixes

- Allow json resolution. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))
- Increase delay of upsert operations. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))

### 🧰 Other Commits

- Install lodash to common module. ([6d1e36b](https://github.com/localazy/directus-extension-localazy/commit/6d1e36b)) ([#8](https://github.com/localazy/directus-extension-localazy/pull/8))

## 1.0.4 (2024-07-17)
### 🔀 Pull Requests

- [Fix CI release #6](https://github.com/localazy/directus-extension-localazy/pull/6)

### 🧰 Other Commits

- Fix CI release ([86ca00a](https://github.com/localazy/directus-extension-localazy/commit/86ca00a)) ([#6](https://github.com/localazy/directus-extension-localazy/pull/6))

## 1.0.3 (2024-07-17)
### 🔀 Pull Requests

- [Update CI config #4](https://github.com/localazy/directus-extension-localazy/pull/4)

### 🧰 Other Commits

- Update CI config ([85ec5ea](https://github.com/localazy/directus-extension-localazy/commit/85ec5ea)) ([#4](https://github.com/localazy/directus-extension-localazy/pull/4))

## 1.0.2 (2024-07-16)
### 🔀 Pull Requests

- [Prepare for release #3](https://github.com/localazy/directus-extension-localazy/pull/3)
- [Add CI #1](https://github.com/localazy/directus-extension-localazy/pull/1)

### 📚 Documentation

- Update main read.me. ([f28afe9](https://github.com/localazy/directus-extension-localazy/commit/f28afe9)) ([#3](https://github.com/localazy/directus-extension-localazy/pull/3))

### 🧰 Other Commits

- Fix development environment. ([f28afe9](https://github.com/localazy/directus-extension-localazy/commit/f28afe9)) ([#3](https://github.com/localazy/directus-extension-localazy/pull/3))
- Add CI ([8d866d0](https://github.com/localazy/directus-extension-localazy/commit/8d866d0)) ([#1](https://github.com/localazy/directus-extension-localazy/pull/1))

