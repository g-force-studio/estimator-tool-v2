// module.exports = {
//   extends: ['next/core-web-vitals'],
//   rules: {
//     '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
//     '@typescript-eslint/no-explicit-any': 'warn',
//   },
// }



module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['next/core-web-vitals', 'plugin:@typescript-eslint/recommended'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}
