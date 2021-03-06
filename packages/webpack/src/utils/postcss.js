import fs from 'fs'
import path from 'path'
import defaults from 'lodash/defaults'
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
import createResolver from 'postcss-import-resolver'

import { isPureObject } from '@nuxt/utils'

export const orderPresets = {
  cssnanoLast: (names) => {
    const nanoIndex = names.indexOf('cssnano')
    if (nanoIndex !== names.length - 1) {
      names.push(names.splice(nanoIndex, 1)[0])
    }
    return names
  }
}

export default class PostcssConfig {
  constructor(options, nuxt) {
    this.nuxt = nuxt
    this.dev = options.dev
    this.postcss = options.build.postcss
    this.srcDir = options.srcDir
    this.rootDir = options.rootDir
    this.cssSourceMap = options.build.cssSourceMap
    this.modulesDir = options.modulesDir
  }

  get defaultConfig() {
    return {
      sourceMap: this.cssSourceMap,
      plugins: {
        // https://github.com/postcss/postcss-import
        'postcss-import': {
          resolve: createResolver({
            alias: {
              '~': path.join(this.srcDir),
              '~~': path.join(this.rootDir),
              '@': path.join(this.srcDir),
              '@@': path.join(this.rootDir)
            },
            modules: [
              this.srcDir,
              this.rootDir,
              ...this.modulesDir
            ]
          })
        },

        // https://github.com/postcss/postcss-url
        'postcss-url': {},

        // https://github.com/csstools/postcss-preset-env
        'postcss-preset-env': this.preset || {},
        'cssnano': this.dev ? false : { preset: 'default' }
      },
      // Array, String or Function
      order: 'cssnanoLast'
    }
  }

  searchConfigFile() {
    // Search for postCSS config file and use it if exists
    // https://github.com/michael-ciniawsky/postcss-load-config
    for (const dir of [this.srcDir, this.rootDir]) {
      for (const file of [
        'postcss.config.js',
        '.postcssrc.js',
        '.postcssrc',
        '.postcssrc.json',
        '.postcssrc.yaml'
      ]) {
        const configFile = path.resolve(dir, file)
        if (fs.existsSync(configFile)) {
          return configFile
        }
      }
    }
  }

  configFromFile() {
    const loaderConfig = (this.postcss && this.postcss.config) || {}
    loaderConfig.path = loaderConfig.path || this.searchConfigFile()

    if (loaderConfig.path) {
      return {
        sourceMap: this.cssSourceMap,
        config: loaderConfig
      }
    }
  }

  normalize(config) {
    if (Array.isArray(config)) {
      config = { plugins: config }
    }
    return config
  }

  sortPlugins({ plugins, order }) {
    const names = Object.keys(plugins)
    if (typeof order === 'string') {
      order = orderPresets[order]
    }
    return typeof order === 'function' ? order(names, orderPresets) : (order || names)
  }

  loadPlugins(config) {
    const { plugins } = config
    if (isPureObject(plugins)) {
      // Map postcss plugins into instances on object mode once
      config.plugins = this.sortPlugins(config)
        .map((p) => {
          const plugin = this.nuxt.resolver.requireModule(p)
          const opts = plugins[p]
          if (opts === false) {
            return // Disabled
          }
          return plugin(opts)
        })
        .filter(Boolean)
    }
  }

  config() {
    /* istanbul ignore if */
    if (!this.postcss) {
      return false
    }

    let config = this.configFromFile()
    if (config) {
      return config
    }

    config = this.normalize(cloneDeep(this.postcss))

    // Apply default plugins
    if (isPureObject(config)) {
      if (config.preset) {
        this.preset = config.preset
        delete config.preset
      }
      if (Array.isArray(config.plugins)) {
        defaults(config, this.defaultConfig)
      } else {
        // Keep the order of default plugins
        config = merge({}, this.defaultConfig, config)
        this.loadPlugins(config)
      }
      return config
    }
  }
}
