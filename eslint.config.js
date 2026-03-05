import js from "@eslint/js";
import tseslintParser from "@typescript-eslint/parser";

export default [
    {
        files: ["**/*.ts", "**/*.js"],
        languageOptions: {
            parser: tseslintParser,
            globals: {
                console: "readonly",
                process: "readonly",
                URL: "readonly",
                require: "readonly",
                fetch: "readonly",
                __dirname: "readonly",
                Buffer: "readonly",
                File: "readonly",
                describe: "readonly",
                expect: "readonly",
                it: "readonly"
            },
        },
        plugins: {
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-unused-vars": "off",
            "no-useless-catch": "off",
            "no-undef": "off",
            "no-useless-escape": "off",
            "no-redeclare": "off"
        },
    },
];