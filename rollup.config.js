import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

import postcss from "rollup-plugin-postcss";
import sass from 'rollup-plugin-sass';

import { terser } from "rollup-plugin-terser";
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

import image from '@rollup/plugin-image';

//import { visualizer } from "rollup-plugin-visualizer";


const packageJson = require("./package.json");

const production = !process.env.ROLLUP_WATCH;

export default [
    {
        input: "src/index.ts",
        output: [
            {
                file: packageJson.main,
                format: "cjs",
                sourcemap: true,
            },
            {
                file: packageJson.module,
                format: "esm",
                sourcemap: true,
            },
        ],
        plugins: [
            peerDepsExternal(),

            resolve(),
            commonjs(),
            typescript({ tsconfig: "./tsconfig.json" }),

            postcss(),
            sass(),

            image(),


            production && terser(),

  //          visualizer(),
    ],
    },
    {
        input: "dist/esm/types/index.d.ts",
        output: [{ file: "dist/index.d.ts", format: "esm" }],
        plugins: [
            dts(),
            ],

        external: [/\.(s?css)$/],
    },
];

