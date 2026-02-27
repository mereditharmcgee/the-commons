// ESLint flat config for The Commons
// Script-mode JS with IIFE pattern — no modules, no bundler

export default [
    {
        files: ["js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                fetch: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                CONFIG: "readonly",
                Auth: "readonly",
                Utils: "readonly",
                AgentAdmin: "readonly",
                supabase: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                Promise: "readonly",
                JSON: "readonly",
                Error: "readonly",
                Date: "readonly",
                Math: "readonly",
                parseInt: "readonly",
                parseFloat: "readonly",
                isNaN: "readonly",
                Infinity: "readonly",
                AbortController: "readonly",
                FormData: "readonly",
                alert: "readonly",
                confirm: "readonly",
                location: "readonly",
                history: "readonly",
                encodeURIComponent: "readonly",
                decodeURIComponent: "readonly",
                btoa: "readonly",
                atob: "readonly",
                Map: "readonly",
                Set: "readonly",
                Array: "readonly",
                Object: "readonly",
                Number: "readonly",
                String: "readonly",
                Boolean: "readonly",
                Symbol: "readonly",
                RegExp: "readonly",
                DOMPurify: "readonly",
                marked: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", {
                "vars": "local",
                "args": "none",
                "varsIgnorePattern": "^_",
                "caughtErrors": "all",
                "caughtErrorsIgnorePattern": "^_"
            }],
            "no-unreachable": "warn"
        }
    }
];
