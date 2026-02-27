import js from "@eslint/js";

export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                console: "readonly",
                process: "readonly",
                URL: "readonly",
                require: "readonly",
                fetch: "readonly",
                __dirname: "readonly",
            },
        },
        plugins: {
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
        },
    },
];
