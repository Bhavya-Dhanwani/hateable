// lint-staged runs from the repo root, so `eslint --fix` resolves the root ESLint (v10),
// which the whole workspace uses — except the Next.js boilerplates. Those pin
// eslint-config-next, which only supports ESLint 9 and throws internal errors under v10
// (scopeManager.addGlobals / react/display-name). They are linted by their own ESLint 9
// via each template's `lint` script, so skip them for eslint here; they still get
// prettier + secretlint like everything else.
const isNextBoilerplate = (file) =>
  file.replace(/\\/g, '/').includes('/boilerplates/nextjs');

export default {
  '*': 'secretlint',
  '*.{js,ts,jsx,tsx}': (files) => {
    const commands = [];
    const lintable = files.filter((f) => !isNextBoilerplate(f));
    if (lintable.length) commands.push(`eslint --fix ${lintable.join(' ')}`);
    commands.push(`prettier --write ${files.join(' ')}`);
    return commands;
  },
  '*.{json,md,yml,yaml}': 'prettier --write'
};
