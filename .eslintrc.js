module.exports = {
	parser: '@typescript-eslint/parser',
	parserOptions: { project: './tsconfig.json', sourceType: 'module' },
	extends: ['plugin:n8n-nodes-base/community'],
	rules: {},
	overrides: [
		{
			files: ['package.json'],
			parser: 'jsonc-eslint-parser',
			extends: ['plugin:n8n-nodes-base/community'],
		},
	],
};
