(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Hydra = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Output = require('./src/output.js')
const loop = require('raf-loop')
const Source = require('./src/hydra-source.js')
const Mouse = require('mouse-change')()
const Audio = require('./src/lib/audio.js')
const VidRecorder = require('./src/lib/video-recorder.js')
const ArrayUtils = require('./src/lib/array-utils.js')
const Sandbox = require('./src/eval-sandbox.js')

const Generator = require('./src/generator-factory.js')

// to do: add ability to pass in certain uniforms and transforms
class HydraRenderer {

  constructor ({
    pb = null,
    width = 1280,
    height = 720,
    numSources = 4,
    numOutputs = 4,
    makeGlobal = true,
    autoLoop = true,
    detectAudio = true,
    enableStreamCapture = true,
    canvas,
    precision = 'mediump',
    extendTransforms = {} // add your own functions on init
  } = {}) {

    ArrayUtils.init()

    this.pb = pb

    this.width = width
    this.height = height
    this.renderAll = false
    this.detectAudio = detectAudio

    this._initCanvas(canvas)


    // object that contains all properties that will be made available on the global context and during local evaluation
    this.synth = {
      time: 0,
      bpm: 30,
      width: this.width,
      height: this.height,
      fps: undefined,
      stats: {
        fps: 0
      },
      speed: 1,
      mouse: Mouse,
      render: this._render.bind(this),
      setResolution: this.setResolution.bind(this),
      update: (dt) => {},// user defined update function
      hush: this.hush.bind(this)
    }

    this.timeSinceLastUpdate = 0
    this._time = 0 // for internal use, only to use for deciding when to render frames

  //  window.synth = this.synth

    // only allow valid precision options
    let precisionOptions = ['lowp','mediump','highp']
    let precisionValid = precisionOptions.includes(precision.toLowerCase())

    this.precision = precisionValid ? precision.toLowerCase() : 'mediump'

    if(!precisionValid){
      console.warn('[hydra-synth warning]\nConstructor was provided an invalid floating point precision value of "' + precision + '". Using default value of "mediump" instead.')
    }

    this.extendTransforms = extendTransforms

    // boolean to store when to save screenshot
    this.saveFrame = false

    // if stream capture is enabled, this object contains the capture stream
    this.captureStream = null

    this.generator = undefined

    this._initRegl()
    this._initOutputs(numOutputs)
    this._initSources(numSources)
    this._generateGlslTransforms()

    this.synth.screencap = () => {
      this.saveFrame = true
    }

    if (enableStreamCapture) {
      this.captureStream = this.canvas.captureStream(25)
      // to do: enable capture stream of specific sources and outputs
      this.synth.vidRecorder = new VidRecorder(this.captureStream)
    }

    if(detectAudio) this._initAudio()

    if(autoLoop) loop(this.tick.bind(this)).start()

    // final argument is properties that the user can set, all others are treated as read-only
    this.sandbox = new Sandbox(this.synth, makeGlobal, ['speed', 'update', 'bpm', 'fps'])
  }

  eval(code) {
    this.sandbox.eval(code)
  }

  getScreenImage(callback) {
    this.imageCallback = callback
    this.saveFrame = true
  }

  hush() {
    this.s.forEach((source) => {
      source.clear()
    })
    this.o.forEach((output) => {
      this.synth.solid(1, 1, 1, 0).out(output)
    })
  }

  setResolution(width, height) {
  //  console.log(width, height)
    this.canvas.width = width
    this.canvas.height = height
    this.width = width
    this.height = height
    this.o.forEach((output) => {
      output.resize(width, height)
    })
    this.s.forEach((source) => {
      source.resize(width, height)
    })
     console.log(this.canvas.width)
  }

  canvasToImage (callback) {
    const a = document.createElement('a')
    a.style.display = 'none'

    let d = new Date()
    a.download = `hydra-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}.${d.getMinutes()}.${d.getSeconds()}.png`
    document.body.appendChild(a)
    var self = this
    this.canvas.toBlob( (blob) => {
        if(self.imageCallback){
          self.imageCallback(blob)
          delete self.imageCallback
        } else {
          a.href = URL.createObjectURL(blob)
          console.log(a.href)
          a.click()
        }
    }, 'image/png')
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(a.href);
    }, 300);
  }

  _initAudio () {
    const that = this
    this.synth.a = new Audio({
      numBins: 4,
      // changeListener: ({audio}) => {
      //   that.a = audio.bins.map((_, index) =>
      //     (scale = 1, offset = 0) => () => (audio.fft[index] * scale + offset)
      //   )
      //
      //   if (that.makeGlobal) {
      //     that.a.forEach((a, index) => {
      //       const aname = `a${index}`
      //       window[aname] = a
      //     })
      //   }
      // }
    })
  }

  // create main output canvas and add to screen
  _initCanvas (canvas) {
    if (canvas) {
      this.canvas = canvas
      this.width = canvas.width
      this.height = canvas.height
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.canvas.style.imageRendering = 'pixelated'
      document.body.appendChild(this.canvas)
    }
  }

  _initRegl () {
    this.regl = require('regl')({
    //  profile: true,
      canvas: this.canvas,
      pixelRatio: 1//,
      // extensions: [
      //   'oes_texture_half_float',
      //   'oes_texture_half_float_linear'
      // ],
      // optionalExtensions: [
      //   'oes_texture_float',
      //   'oes_texture_float_linear'
     //]
   })

    // This clears the color buffer to black and the depth buffer to 1
    this.regl.clear({
      color: [0, 0, 0, 1]
    })

    this.renderAll = this.regl({
      frag: `
      precision ${this.precision} float;
      varying vec2 uv;
      uniform sampler2D tex0;
      uniform sampler2D tex1;
      uniform sampler2D tex2;
      uniform sampler2D tex3;

      void main () {
        vec2 st = vec2(1.0 - uv.x, uv.y);
        st*= vec2(2);
        vec2 q = floor(st).xy*(vec2(2.0, 1.0));
        int quad = int(q.x) + int(q.y);
        st.x += step(1., mod(st.y,2.0));
        st.y += step(1., mod(st.x,2.0));
        st = fract(st);
        if(quad==0){
          gl_FragColor = texture2D(tex0, st);
        } else if(quad==1){
          gl_FragColor = texture2D(tex1, st);
        } else if (quad==2){
          gl_FragColor = texture2D(tex2, st);
        } else {
          gl_FragColor = texture2D(tex3, st);
        }

      }
      `,
      vert: `
      precision ${this.precision} float;
      attribute vec2 position;
      varying vec2 uv;

      void main () {
        uv = position;
        gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
      }`,
      attributes: {
        position: [
          [-2, 0],
          [0, -2],
          [2, 2]
        ]
      },
      uniforms: {
        tex0: this.regl.prop('tex0'),
        tex1: this.regl.prop('tex1'),
        tex2: this.regl.prop('tex2'),
        tex3: this.regl.prop('tex3')
      },
      count: 3,
      depth: { enable: false }
    })

    this.renderFbo = this.regl({
      frag: `
      precision ${this.precision} float;
      varying vec2 uv;
      uniform vec2 resolution;
      uniform sampler2D tex0;

      void main () {
        gl_FragColor = texture2D(tex0, vec2(1.0 - uv.x, uv.y));
      }
      `,
      vert: `
      precision ${this.precision} float;
      attribute vec2 position;
      varying vec2 uv;

      void main () {
        uv = position;
        gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
      }`,
      attributes: {
        position: [
          [-2, 0],
          [0, -2],
          [2, 2]
        ]
      },
      uniforms: {
        tex0: this.regl.prop('tex0'),
        resolution: this.regl.prop('resolution')
      },
      count: 3,
      depth: { enable: false }
    })
  }

  _initOutputs (numOutputs) {
    const self = this
    this.o = (Array(numOutputs)).fill().map((el, index) => {
      var o = new Output({
        regl: this.regl,
        width: this.width,
        height: this.height,
        precision: this.precision
      })
    //  o.render()
      o.id = index
      self.synth['o'+index] = o
      return o
    })

    // set default output
    this.output = this.o[0]
  }

  _initSources (numSources) {
    this.s = []
    for(var i = 0; i < numSources; i++) {
      this.createSource()
    }
  }

  createSource () {
    let s = new Source({regl: this.regl, pb: this.pb, width: this.width, height: this.height})
    this.synth['s' + this.s.length] = s
    this.s.push(s)
    return s
  }

  _generateGlslTransforms () {
    var self = this
    this.generator = new Generator({
      defaultOutput: this.o[0],
      defaultUniforms: this.o[0].uniforms,
      extendTransforms: this.extendTransforms,
      changeListener: ({type, method, synth}) => {
          if (type === 'add') {
            self.synth[method] = synth.generators[method]
            if(self.sandbox) self.sandbox.add(method)
          } else if (type === 'remove') {
            // what to do here? dangerously deleting window methods
            //delete window[method]
          }
      //  }
      }
    })
    this.synth.setFunction = this.generator.setFunction.bind(this.generator)
  }

  _render (output) {
    if (output) {
      this.output = output
      this.isRenderingAll = false
    } else {
      this.isRenderingAll = true
    }
  }

  // dt in ms
  tick (dt, uniforms) {
    this.sandbox.tick()
    if(this.detectAudio === true) this.synth.a.tick()
  //  let updateInterval = 1000/this.synth.fps // ms
    if(this.synth.update) {
      try { this.synth.update(dt) } catch (e) { console.log(error) }
    }

    this.sandbox.set('time', this.synth.time += dt * 0.001 * this.synth.speed)
    this.timeSinceLastUpdate += dt
    if(!this.synth.fps || this.timeSinceLastUpdate >= 1000/this.synth.fps) {
    //  console.log(1000/this.timeSinceLastUpdate)
      this.synth.stats.fps = Math.ceil(1000/this.timeSinceLastUpdate)
    //  console.log(this.synth.speed, this.synth.time)
      for (let i = 0; i < this.s.length; i++) {
        this.s[i].tick(this.synth.time)
      }
    //  console.log(this.canvas.width, this.canvas.height)
      for (let i = 0; i < this.o.length; i++) {
        this.o[i].tick({
          time: this.synth.time,
          mouse: this.synth.mouse,
          bpm: this.synth.bpm,
          resolution: [this.canvas.width, this.canvas.height]
        })
      }
      if (this.isRenderingAll) {
        this.renderAll({
          tex0: this.o[0].getCurrent(),
          tex1: this.o[1].getCurrent(),
          tex2: this.o[2].getCurrent(),
          tex3: this.o[3].getCurrent(),
          resolution: [this.canvas.width, this.canvas.height]
        })
      } else {

        this.renderFbo({
          tex0: this.output.getCurrent(),
          resolution: [this.canvas.width, this.canvas.height]
        })
      }
      this.timeSinceLastUpdate = 0
    }
    if(this.saveFrame === true) {
      this.canvasToImage()
      this.saveFrame = false
    }
  //  this.regl.poll()
  }


}

module.exports = HydraRenderer

},{"./src/eval-sandbox.js":2,"./src/generator-factory.js":3,"./src/hydra-source.js":8,"./src/lib/array-utils.js":9,"./src/lib/audio.js":10,"./src/lib/video-recorder.js":14,"./src/output.js":16,"mouse-change":19,"raf-loop":22,"regl":24}],2:[function(require,module,exports){
// handles code evaluation and attaching relevant objects to global and evaluation contexts

const Sandbox = require('./lib/sandbox.js')
const ArrayUtils = require('./lib/array-utils.js')

class EvalSandbox {
  constructor(parent, makeGlobal, userProps = []) {
    this.makeGlobal = makeGlobal
    this.sandbox = Sandbox(parent)
    this.parent = parent
    var properties = Object.keys(parent)
    properties.forEach((property) => this.add(property))
    this.userProps = userProps
  }

  add(name) {
    if(this.makeGlobal) window[name] = this.parent[name]
    this.sandbox.addToContext(name, `parent.${name}`)
  }

// sets on window as well as synth object if global (not needed for objects, which can be set directly)

  set(property, value) {
    if(this.makeGlobal) {
      window[property] = value
    }
    this.parent[property] = value
  }

  tick() {
    if(this.makeGlobal) {
      this.userProps.forEach((property) => {
        this.parent[property] = window[property]
      })
      //  this.parent.speed = window.speed
    } else {

    }
  }

  eval(code) {
    this.sandbox.eval(code)
  }
}

module.exports = EvalSandbox

},{"./lib/array-utils.js":9,"./lib/sandbox.js":12}],3:[function(require,module,exports){
const glslTransforms = require('./glsl/glsl-functions.js')
const GlslSource = require('./glsl-source.js')

class GeneratorFactory {
  constructor ({
      defaultUniforms,
      defaultOutput,
      extendTransforms = [],
      changeListener = (() => {})
    } = {}
    ) {
    this.defaultOutput = defaultOutput
    this.defaultUniforms = defaultUniforms
    this.changeListener = changeListener
    this.extendTransforms = extendTransforms
    this.generators = {}
    this.init()
  }
  init () {
    this.glslTransforms = {}
    this.generators = Object.entries(this.generators).reduce((prev, [method, transform]) => {
      this.changeListener({type: 'remove', synth: this, method})
      return prev
    }, {})

    this.sourceClass = (() => {
      return class extends GlslSource {
      }
    })()

    let functions = glslTransforms
    // const addTransforms = (transforms) =>
    //   Object.entries(transforms).forEach(([method, transform]) => {
    //     functions[method] = transform
    //   })

    // const addTransforms =
    //
    // addTransforms(glslTransforms)
    // //addTransforms(renderpassFunctions)
    //
    // if (typeof this.extendTransforms === 'function') {
    //   functions = this.extendTransforms(functions)
    // } else
    if (Array.isArray(this.extendTransforms)) {
      functions.concat(this.extendTransforms)
    } else if (typeof this.extendTransforms === 'object') {
      functions.push(this.extendTransforms)
    }

  //  console.log(functions)
    //
    // Object.entries(functions).forEach(([method, transform]) => {
    //   if (typeof transform.glsl_return_type === 'undefined' && transform.glsl) {
    //     transform.glsl_return_type = transform.glsl.replace(new RegExp(`^(?:[\\s\\S]*\\W)?(\\S+)\\s+${method}\\s*[(][\\s\\S]*`, 'ugm'), '$1')
    //   }
    //
    //   functions[method] = this._addMethod(method, transform)
    // })

    return functions.map((transform) => this.setFunction(transform))
 }

 _addMethod (method, transform) {
//   console.log('adding', method, transform)
    this.glslTransforms[method] = transform
    if (transform.type === 'src') {
      const func = (...args) => new this.sourceClass({
        name: method,
        transform: transform,
        userArgs: args,
        defaultOutput: this.defaultOutput,
        defaultUniforms: this.defaultUniforms,
        synth: this
      })
      this.generators[method] = func
      this.changeListener({type: 'add', synth: this, method})
      return func
    } else  {
      this.sourceClass.prototype[method] = function (...args) {
        this.transforms.push({name: method, transform: transform, userArgs: args})
        return this
      }
    }
    return undefined
  }

  setFunction(obj) {
    var processedGlsl = processGlsl(obj)
  //  console.log(processedGlsl)
    if(processedGlsl) this._addMethod(obj.name, processedGlsl)
  }
}



const typeLookup = {
  'src': {
    returnType: 'vec4',
    args: ['vec2 _st']
  },
  'coord': {
    returnType: 'vec2',
    args: ['vec2 _st']
  },
  'color': {
    returnType: 'vec4',
    args: ['vec4 _c0']
  },
  'combine': {
    returnType: 'vec4',
    args: ['vec4 _c0', 'vec4 _c1']
  },
  'combineCoord': {
    returnType: 'vec2',
    args: ['vec2 _st', 'vec4 _c0']
  }
}
// expects glsl of format
// {
//   name: 'osc', // name that will be used to access function as well as within glsl
//   type: 'src', // can be src: vec4(vec2 _st), coord: vec2(vec2 _st), color: vec4(vec4 _c0), combine: vec4(vec4 _c0, vec4 _c1), combineCoord: vec2(vec2 _st, vec4 _c0)
//   inputs: [
//     {
//       name: 'freq',
//       type: 'float', // 'float'   //, 'texture', 'vec4'
//       default: 0.2
//     },
//     {
//           name: 'sync',
//           type: 'float',
//           default: 0.1
//         },
//         {
//           name: 'offset',
//           type: 'float',
//           default: 0.0
//         }
//   ],
   //  glsl: `
   //    vec2 st = _st;
   //    float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
   //    float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
   //    float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
   //    return vec4(r, g, b, 1.0);
   // `
// }

// // generates glsl function:
// `vec4 osc(vec2 _st, float freq, float sync, float offset){
//  vec2 st = _st;
//  float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
//  float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
//  float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
//  return vec4(r, g, b, 1.0);
// }`

function processGlsl(obj) {
  let t = typeLookup[obj.type]
  if(t) {
  let baseArgs = t.args.map((arg) => arg).join(", ")
  // @todo: make sure this works for all input types, add validation
  let customArgs = obj.inputs.map((input) => `${input.type} ${input.name}`).join(', ')
  let args = `${baseArgs}${customArgs.length > 0 ? ', '+ customArgs: ''}`
//  console.log('args are ', args)

    let glslFunction =
`
  ${t.returnType} ${obj.name}(${args}) {
      ${obj.glsl}
  }
`
  //  console.log('function', glslFunction)
    // {
    //   name: 'color',
    //   type: 'vec4'
    // },

  // add extra input to beginning for backward combatibility @todo update compiler so this is no longer necessary
    if(obj.type === 'combine' || obj.type === 'combineCoord') obj.inputs.unshift({
        name: 'color',
        type: 'vec4'
      })
    return Object.assign({}, obj, { glsl: glslFunction})
  } else {
    console.warn(`type ${obj.type} not recognized`)
  }

}

module.exports = GeneratorFactory

},{"./glsl-source.js":4,"./glsl/glsl-functions.js":6}],4:[function(require,module,exports){
const generateGlsl = require('./glsl-utils.js').generateGlsl
const formatArguments = require('./glsl-utils.js').formatArguments

// const glslTransforms = require('./glsl/composable-glsl-functions.js')
const utilityGlsl = require('./glsl/utility-functions.js')

var GlslSource = function (obj) {
  this.transforms = []
  this.transforms.push(obj)
  this.defaultOutput = obj.defaultOutput
  this.synth = obj.synth
  this.defaultUniforms = obj.defaultUniforms
  return this
}

GlslSource.prototype.addTransform = function (obj)  {
    this.transforms.push(obj)
}

GlslSource.prototype.out = function (_output) {
  var output = _output || this.defaultOutput
  var glsl = this.glsl(output)
  this.synth.currentFunctions = []
 // output.renderPasses(glsl)
  if(output) try{
    output.render(glsl)
  } catch (error) {
    console.log('shader could not compile', error)
  }
}

GlslSource.prototype.glsl = function () {
  //var output = _output || this.defaultOutput
  var self = this
  // uniforms included in all shaders
//  this.defaultUniforms = output.uniforms
  var passes = []
  var transforms = []
//  console.log('output', output)
  this.transforms.forEach((transform) => {
    if(transform.transform.type === 'renderpass'){
      // if (transforms.length > 0) passes.push(this.compile(transforms, output))
      // transforms = []
      // var uniforms = {}
      // const inputs = formatArguments(transform, -1)
      // inputs.forEach((uniform) => { uniforms[uniform.name] = uniform.value })
      //
      // passes.push({
      //   frag: transform.transform.frag,
      //   uniforms: Object.assign({}, self.defaultUniforms, uniforms)
      // })
      // transforms.push({name: 'prev', transform:  glslTransforms['prev'], synth: this.synth})
      console.warn('no support for renderpass')
    } else {
      transforms.push(transform)
    }
  })

  if (transforms.length > 0) passes.push(this.compile(transforms))

  return passes
}

GlslSource.prototype.compile = function (transforms) {

  var shaderInfo = generateGlsl(transforms)
  var uniforms = {}
  shaderInfo.uniforms.forEach((uniform) => { uniforms[uniform.name] = uniform.value })

  var frag = `
  precision mediump float;
  ${Object.values(shaderInfo.uniforms).map((uniform) => {
    let type = uniform.type
    switch (uniform.type) {
      case 'texture':
        type = 'sampler2D'
        break
    }
    return `
      uniform ${type} ${uniform.name};`
  }).join('')}
  uniform float time;
  uniform vec2 resolution;
  varying vec2 uv;
  uniform sampler2D prevBuffer;

  ${Object.values(utilityGlsl).map((transform) => {
  //  console.log(transform.glsl)
    return `
            ${transform.glsl}
          `
  }).join('')}

  ${shaderInfo.glslFunctions.map((transform) => {
    return `
            ${transform.transform.glsl}
          `
  }).join('')}

  void main () {
    vec4 c = vec4(1, 0, 0, 1);
    vec2 st = gl_FragCoord.xy/resolution.xy;
    gl_FragColor = ${shaderInfo.fragColor};
  }
  `

  return {
    frag: frag,
    uniforms: Object.assign({}, this.defaultUniforms, uniforms)
  }

}

module.exports = GlslSource

},{"./glsl-utils.js":5,"./glsl/utility-functions.js":7}],5:[function(require,module,exports){
// converts a tree of javascript functions to a shader

// Add extra functionality to Array.prototype for generating sequences in time
const arrayUtils = require('./lib/array-utils.js')

// [WIP] how to treat different dimensions (?)
const DEFAULT_CONVERSIONS = {
  float: {
    'vec4': {name: 'sum', args: [[1, 1, 1, 1]]},
    'vec2': {name: 'sum', args: [[1, 1]]}
  }
}

module.exports = {
  generateGlsl: function (transforms) {
    var shaderParams = {
      uniforms: [], // list of uniforms used in shader
      glslFunctions: [], // list of functions used in shader
      fragColor: ''
    }

    var gen = generateGlsl(transforms, shaderParams)('st')
    shaderParams.fragColor = gen
    return shaderParams
  },
  formatArguments: formatArguments
}
// recursive function for generating shader string from object containing functions and user arguments. Order of functions in string depends on type of function
// to do: improve variable names
function generateGlsl (transforms, shaderParams) {

  // transform function that outputs a shader string corresponding to gl_FragColor
  var fragColor = () => ''
  // var uniforms = []
  // var glslFunctions = []
  transforms.forEach((transform) => {
    var inputs = formatArguments(transform, shaderParams.uniforms.length)
    inputs.forEach((input) => {
      if(input.isUniform) shaderParams.uniforms.push(input)
    })

   // add new glsl function to running list of functions
    if(!contains(transform, shaderParams.glslFunctions)) shaderParams.glslFunctions.push(transform)

    // current function for generating frag color shader code
    var f0 = fragColor
    if (transform.transform.type === 'src') {
      fragColor = (uv) => `${shaderString(uv, transform.name, inputs, shaderParams)}`
    } else if (transform.transform.type === 'coord') {
      fragColor = (uv) => `${f0(`${shaderString(uv, transform.name, inputs, shaderParams)}`)}`
    } else if (transform.transform.type === 'color') {
      fragColor = (uv) =>  `${shaderString(`${f0(uv)}`, transform.name, inputs, shaderParams)}`
    } else if (transform.transform.type === 'combine') {
      // combining two generated shader strings (i.e. for blend, mult, add funtions)
      var f1 = inputs[0].value && inputs[0].value.transforms ?
        (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams)(uv)}` :
        (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
      fragColor = (uv) => `${shaderString(`${f0(uv)}, ${f1(uv)}`, transform.name, inputs.slice(1), shaderParams)}`
    } else if (transform.transform.type === 'combineCoord') {
      // combining two generated shader strings (i.e. for modulate functions)
      var f1 = inputs[0].value && inputs[0].value.transforms ?
        (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams)(uv)}` :
        (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
      fragColor = (uv) => `${f0(`${shaderString(`${uv}, ${f1(uv)}`, transform.name, inputs.slice(1), shaderParams)}`)}`


    }
  })

  return fragColor
}

// assembles a shader string containing the arguments and the function name, i.e. 'osc(uv, frequency)'
function shaderString (uv, method, inputs, shaderParams) {
  const str = inputs.map((input) => {
    if (input.isUniform) {
      return input.name
    } else if (input.value && input.value.transforms) {
      // this by definition needs to be a generator, hence we start with 'st' as the initial value for generating the glsl fragment
      return `${generateGlsl(input.value.transforms, shaderParams)('st')}`
    }
    return input.value
  }).reduce((p, c) => `${p}, ${c}`, '')

  return `${method}(${uv}${str})`
}

// merge two arrays and remove duplicates
function mergeArrays (a, b) {
  return a.concat(b.filter(function (item) {
    return a.indexOf(item) < 0;
  }))
}

// check whether array
function contains(object, arr) {
  for(var i = 0; i < arr.length; i++){
    if(object.name == arr[i].name) return true
  }
  return false
}

function fillArrayWithDefaults (arr, len) {
  // fill the array with default values if it's too short
  while (arr.length < len) {
    if (arr.length === 3) { // push a 1 as the default for .a in vec4
      arr.push(1.0)
    } else {
      arr.push(0.0)
    }
  }
  return arr.slice(0, len)
}

const ensure_decimal_dot = (val) => {
  val = val.toString()
  if (val.indexOf('.') < 0) {
    val += '.'
  }
  return val
}

function formatArguments (transform, startIndex) {
//  console.log('processing args', transform, startIndex)
  const defaultArgs = transform.transform.inputs
  const userArgs = transform.userArgs
  return defaultArgs.map( (input, index) => {
    const typedArg = {
      value: input.default,
      type: input.type, //
      isUniform: false,
      name: input.name,
      vecLen: 0
    //  generateGlsl: null // function for creating glsl
    }

    if(typedArg.type === 'float') typedArg.value = ensure_decimal_dot(input.default)
    if (input.type.startsWith('vec')) {
      try {
        typedArg.vecLen = Number.parseInt(input.type.substr(3))
      } catch (e) {
        console.log(`Error determining length of vector input type ${input.type} (${input.name})`)
      }
    }

    // if user has input something for this argument
    if(userArgs.length > index) {
      typedArg.value = userArgs[index]
      // do something if a composite or transform

      if (typeof userArgs[index] === 'function') {
        if (typedArg.vecLen > 0) { // expected input is a vector, not a scalar
          typedArg.value = (context, props, batchId) => (fillArrayWithDefaults(userArgs[index](props), typedArg.vecLen))
        } else {
          typedArg.value = (context, props, batchId) => {
           try {
             return userArgs[index](props)
           } catch (e) {
             console.log('ERROR', e)
             return input.default
           }
         }
        }

        typedArg.isUniform = true
      } else if (userArgs[index].constructor === Array) {
        if (typedArg.vecLen > 0) { // expected input is a vector, not a scalar
          typedArg.isUniform = true
          typedArg.value = fillArrayWithDefaults(typedArg.value, typedArg.vecLen)
        } else {
      //  console.log("is Array")
          typedArg.value = (context, props, batchId) => arrayUtils.getValue(userArgs[index])(props)
          typedArg.isUniform = true
        }
      }
    }

    if(startIndex< 0){
    } else {
    if (typedArg.value && typedArg.value.transforms) {
      const final_transform = typedArg.value.transforms[typedArg.value.transforms.length - 1]



      if (final_transform.transform.glsl_return_type !== input.type) {
        const defaults = DEFAULT_CONVERSIONS[input.type]
        if (typeof defaults !== 'undefined') {
          const default_def = defaults[final_transform.transform.glsl_return_type]
          if (typeof default_def !== 'undefined') {
            const {name, args} = default_def
            typedArg.value = typedArg.value[name](...args)
          }
        }
      }

      typedArg.isUniform = false
    } else if (typedArg.type === 'float' && typeof typedArg.value === 'number') {
      typedArg.value = ensure_decimal_dot(typedArg.value)
    } else if (typedArg.type.startsWith('vec') && typeof typedArg.value === 'object' && Array.isArray(typedArg.value)) {
      typedArg.isUniform = false
      typedArg.value = `${typedArg.type}(${typedArg.value.map(ensure_decimal_dot).join(', ')})`
    } else if (input.type === 'sampler2D') {
      // typedArg.tex = typedArg.value
      var x = typedArg.value
      typedArg.value = () => (x.getTexture())
      typedArg.isUniform = true
    } else {
      // if passing in a texture reference, when function asks for vec4, convert to vec4
      if (typedArg.value.getTexture && input.type === 'vec4') {
        var x1 = typedArg.value
        typedArg.value = src(x1)
        typedArg.isUniform = false
      }
    }

    // add tp uniform array if is a function that will pass in a different value on each render frame,
    // or a texture/ external source

      if(typedArg.isUniform) {
         typedArg.name += startIndex
      //  shaderParams.uniforms.push(typedArg)
      }
}
    return typedArg
  })
}

},{"./lib/array-utils.js":9}],6:[function(require,module,exports){
/*
Format for adding functions to hydra. For each entry in this file, hydra automatically generates a glsl function and javascript function with the same name. You can also add functions dynamically using setFunction(object).

{
  name: 'osc', // name that will be used to access function in js as well as in glsl
  type: 'src', // can be 'src', 'color', 'combine', 'combineCoords'. see below for more info
  inputs: [
    {
      name: 'freq',
      type: 'float',
      default: 0.2
    },
    {
      name: 'sync',
      type: 'float',
      default: 0.1
    },
    {
      name: 'offset',
      type: 'float',
      default: 0.0
    }
  ],
    glsl: `
      vec2 st = _st;
      float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
      float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
      float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
      return vec4(r, g, b, 1.0);
   `
}

// The above code generates the glsl function:
`vec4 osc(vec2 _st, float freq, float sync, float offset){
 vec2 st = _st;
 float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
 float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
 float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
 return vec4(r, g, b, 1.0);
}`


Types and default arguments for hydra functions.
The value in the 'type' field lets the parser know which type the function will be returned as well as default arguments.

const types = {
  'src': {
    returnType: 'vec4',
    args: ['vec2 _st']
  },
  'coord': {
    returnType: 'vec2',
    args: ['vec2 _st']
  },
  'color': {
    returnType: 'vec4',
    args: ['vec4 _c0']
  },
  'combine': {
    returnType: 'vec4',
    args: ['vec4 _c0', 'vec4 _c1']
  },
  'combineCoord': {
    returnType: 'vec2',
    args: ['vec2 _st', 'vec4 _c0']
  }
}

*/

module.exports = [
  {
  name: 'noise',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 10,
    },
{
      type: 'float',
      name: 'offset',
      default: 0.1,
    }
  ],
  glsl:
`   return vec4(vec3(_noise(vec3(_st*scale, offset*time))), 1.0);`
},
{
  name: 'voronoi',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 5,
    },
{
      type: 'float',
      name: 'speed',
      default: 0.3,
    },
{
      type: 'float',
      name: 'blending',
      default: 0.3,
    }
  ],
  glsl:
`   vec3 color = vec3(.0);
   // Scale
   _st *= scale;
   // Tile the space
   vec2 i_st = floor(_st);
   vec2 f_st = fract(_st);
   float m_dist = 10.;  // minimun distance
   vec2 m_point;        // minimum point
   for (int j=-1; j<=1; j++ ) {
   for (int i=-1; i<=1; i++ ) {
   vec2 neighbor = vec2(float(i),float(j));
   vec2 p = i_st + neighbor;
   vec2 point = fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
   point = 0.5 + 0.5*sin(time*speed + 6.2831*point);
   vec2 diff = neighbor + point - f_st;
   float dist = length(diff);
   if( dist < m_dist ) {
   m_dist = dist;
   m_point = point;
   }
   }
   }
   // Assign a color using the closest point position
   color += dot(m_point,vec2(.3,.6));
   color *= 1.0 - blending*m_dist;
   return vec4(color, 1.0);`
},
{
  name: 'osc',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'frequency',
      default: 60,
    },
{
      type: 'float',
      name: 'sync',
      default: 0.1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   vec2 st = _st;
   float r = sin((st.x-offset/frequency+time*sync)*frequency)*0.5  + 0.5;
   float g = sin((st.x+time*sync)*frequency)*0.5 + 0.5;
   float b = sin((st.x+offset/frequency+time*sync)*frequency)*0.5  + 0.5;
   return vec4(r, g, b, 1.0);`
},
{
  name: 'shape',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'sides',
      default: 3,
    },
{
      type: 'float',
      name: 'radius',
      default: 0.3,
    },
{
      type: 'float',
      name: 'smoothing',
      default: 0.01,
    }
  ],
  glsl:
`   vec2 st = _st * 2. - 1.;
   // Angle and radius from the current pixel
   float a = atan(st.x,st.y)+3.1416;
   float r = (2.*3.1416)/sides;
   float d = cos(floor(.5+a/r)*r-a)*length(st);
   return vec4(vec3(1.0-smoothstep(radius,radius + smoothing,d)), 1.0);`
},
{
  name: 'gradient',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   return vec4(_st, sin(time*speed), 1.0);`
},
{
  name: 'src',
  type: 'src',
  inputs: [
    {
      type: 'sampler2D',
      name: 'tex',
      default: NaN,
    }
  ],
  glsl:
`   //  vec2 uv = gl_FragCoord.xy/vec2(1280., 720.);
   return texture2D(tex, fract(_st));`
},
{
  name: 'solid',
  type: 'src',
  inputs: [
    {
      type: 'float',
      name: 'r',
      default: 0,
    },
{
      type: 'float',
      name: 'g',
      default: 0,
    },
{
      type: 'float',
      name: 'b',
      default: 0,
    },
{
      type: 'float',
      name: 'a',
      default: 1,
    }
  ],
  glsl:
`   return vec4(r, g, b, a);`
},
{
  name: 'rotate',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'angle',
      default: 10,
    },
{
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   vec2 xy = _st - vec2(0.5);
   float ang = angle + speed *time;
   xy = mat2(cos(angle),-sin(ang), sin(ang),cos(ang))*xy;
   xy += 0.5;
   return xy;`
},
{
  name: 'scale',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1.5,
    },
{
      type: 'float',
      name: 'xMult',
      default: 1,
    },
{
      type: 'float',
      name: 'yMult',
      default: 1,
    },
{
      type: 'float',
      name: 'offsetX',
      default: 0.5,
    },
{
      type: 'float',
      name: 'offsetY',
      default: 0.5,
    }
  ],
  glsl:
`   vec2 xy = _st - vec2(offsetX, offsetY);
   xy*=(1.0/vec2(amount*xMult, amount*yMult));
   xy+=vec2(offsetX, offsetY);
   return xy;
   `
},
{
  name: 'pixelate',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'pixelX',
      default: 20,
    },
{
      type: 'float',
      name: 'pixelY',
      default: 20,
    }
  ],
  glsl:
`   vec2 xy = vec2(pixelX, pixelY);
   return (floor(_st * xy) + 0.5)/xy;`
},
{
  name: 'posterize',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'bins',
      default: 3,
    },
{
      type: 'float',
      name: 'gamma',
      default: 0.6,
    }
  ],
  glsl:
`   vec4 c2 = pow(_c0, vec4(gamma));
   c2 *= vec4(bins);
   c2 = floor(c2);
   c2/= vec4(bins);
   c2 = pow(c2, vec4(1.0/gamma));
   return vec4(c2.xyz, _c0.a);`
},
{
  name: 'shift',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'r',
      default: 0.5,
    },
{
      type: 'float',
      name: 'g',
      default: 0,
    },
{
      type: 'float',
      name: 'b',
      default: 0,
    },
{
      type: 'float',
      name: 'a',
      default: 0,
    }
  ],
  glsl:
`   vec4 c2 = vec4(_c0);
   c2.r = fract(c2.r + r);
   c2.g = fract(c2.g + g);
   c2.b = fract(c2.b + b);
   c2.a = fract(c2.a + a);
   return vec4(c2.rgba);`
},
{
  name: 'repeat',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'repeatX',
      default: 3,
    },
{
      type: 'float',
      name: 'repeatY',
      default: 3,
    },
{
      type: 'float',
      name: 'offsetX',
      default: 0,
    },
{
      type: 'float',
      name: 'offsetY',
      default: 0,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(repeatX, repeatY);
   st.x += step(1., mod(st.y,2.0)) * offsetX;
   st.y += step(1., mod(st.x,2.0)) * offsetY;
   return fract(st);`
},
{
  name: 'modulateRepeat',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'repeatX',
      default: 3,
    },
{
      type: 'float',
      name: 'repeatY',
      default: 3,
    },
{
      type: 'float',
      name: 'offsetX',
      default: 0.5,
    },
{
      type: 'float',
      name: 'offsetY',
      default: 0.5,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(repeatX, repeatY);
   st.x += step(1., mod(st.y,2.0)) + _c0.r * offsetX;
   st.y += step(1., mod(st.x,2.0)) + _c0.g * offsetY;
   return fract(st);`
},
{
  name: 'repeatX',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'reps',
      default: 3,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(reps, 1.0);
   //  float f =  mod(_st.y,2.0);
   st.y += step(1., mod(st.x,2.0))* offset;
   return fract(st);`
},
{
  name: 'modulateRepeatX',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'reps',
      default: 3,
    },
{
      type: 'float',
      name: 'offset',
      default: 0.5,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(reps, 1.0);
   //  float f =  mod(_st.y,2.0);
   st.y += step(1., mod(st.x,2.0)) + _c0.r * offset;
   return fract(st);`
},
{
  name: 'repeatY',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'reps',
      default: 3,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(1.0, reps);
   //  float f =  mod(_st.y,2.0);
   st.x += step(1., mod(st.y,2.0))* offset;
   return fract(st);`
},
{
  name: 'modulateRepeatY',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'reps',
      default: 3,
    },
{
      type: 'float',
      name: 'offset',
      default: 0.5,
    }
  ],
  glsl:
`   vec2 st = _st * vec2(reps, 1.0);
   //  float f =  mod(_st.y,2.0);
   st.x += step(1., mod(st.y,2.0)) + _c0.r * offset;
   return fract(st);`
},
{
  name: 'kaleid',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'nSides',
      default: 4,
    }
  ],
  glsl:
`   vec2 st = _st;
   st -= 0.5;
   float r = length(st);
   float a = atan(st.y, st.x);
   float pi = 2.*3.1416;
   a = mod(a,pi/nSides);
   a = abs(a-pi/nSides/2.);
   return r*vec2(cos(a), sin(a));`
},
{
  name: 'modulateKaleid',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'nSides',
      default: 4,
    }
  ],
  glsl:
`   vec2 st = _st - 0.5;
   float r = length(st);
   float a = atan(st.y, st.x);
   float pi = 2.*3.1416;
   a = mod(a,pi/nSides);
   a = abs(a-pi/nSides/2.);
   return (_c0.r+r)*vec2(cos(a), sin(a));`
},
{
  name: 'scroll',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'scrollX',
      default: 0.5,
    },
{
      type: 'float',
      name: 'scrollY',
      default: 0.5,
    },
{
      type: 'float',
      name: 'speedX',
      default: 0,
    },
{
      type: 'float',
      name: 'speedY',
      default: 0,
    }
  ],
  glsl:
`
   _st.x += scrollX + time*speedX;
   _st.y += scrollY + time*speedY;
   return _st;`
},
{
  name: 'scrollX',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'scrollX',
      default: 0.5,
    },
{
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   _st.x += scrollX + time*speed;
   return _st;`
},
{
  name: 'modulateScrollX',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'scrollX',
      default: 0.5,
    },
{
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   _st.x += _c0.r*amount + time*speed;
   return _st;`
},
{
  name: 'scrollY',
  type: 'coord',
  inputs: [
    {
      type: 'float',
      name: 'scrollY',
      default: 0.5,
    },
{
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   _st.y += scrollY + time*speed;
   return _st;`
},
{
  name: 'modulateScrollY',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'scrollY',
      default: 0.5,
    },
{
      type: 'float',
      name: 'speed',
      default: 0,
    }
  ],
  glsl:
`   _st.y += _c0.r*scrollY + time*speed;
   return _st;`
},
{
  name: 'add',
  type: 'combine',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1,
    }
  ],
  glsl:
`   return (_c0+_c1)*amount + _c0*(1.0-amount);`
},
{
  name: 'sub',
  type: 'combine',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1,
    }
  ],
  glsl:
`   return (_c0-_c1)*amount + _c0*(1.0-amount);`
},
{
  name: 'layer',
  type: 'combine',
  inputs: [

  ],
  glsl:
`   return vec4(mix(_c0.rgb, _c1.rgb, _c1.a), _c0.a+_c1.a);`
},
{
  name: 'blend',
  type: 'combine',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 0.5,
    }
  ],
  glsl:
`   return _c0*(1.0-amount)+_c1*amount;`
},
{
  name: 'mult',
  type: 'combine',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1,
    }
  ],
  glsl:
`   return _c0*(1.0-amount)+(_c0*_c1)*amount;`
},
{
  name: 'diff',
  type: 'combine',
  inputs: [

  ],
  glsl:
`   return vec4(abs(_c0.rgb-_c1.rgb), max(_c0.a, _c1.a));`
},
{
  name: 'modulate',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 0.1,
    }
  ],
  glsl:
`   //  return fract(st+(_c0.xy-0.5)*amount);
   return _st + _c0.xy*amount;`
},
{
  name: 'modulateScale',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'multiple',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 1,
    }
  ],
  glsl:
`   vec2 xy = _st - vec2(0.5);
   xy*=(1.0/vec2(offset + multiple*_c0.r, offset + multiple*_c0.g));
   xy+=vec2(0.5);
   return xy;`
},
{
  name: 'modulatePixelate',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'multiple',
      default: 10,
    },
{
      type: 'float',
      name: 'offset',
      default: 3,
    }
  ],
  glsl:
`   vec2 xy = vec2(offset + _c0.x*multiple, offset + _c0.y*multiple);
   return (floor(_st * xy) + 0.5)/xy;`
},
{
  name: 'modulateRotate',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'multiple',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   vec2 xy = _st - vec2(0.5);
   float angle = offset + _c0.x * multiple;
   xy = mat2(cos(angle),-sin(angle), sin(angle),cos(angle))*xy;
   xy += 0.5;
   return xy;`
},
{
  name: 'modulateHue',
  type: 'combineCoord',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1,
    }
  ],
  glsl:
`   return _st + (vec2(_c0.g - _c0.r, _c0.b - _c0.g) * amount * 1.0/resolution);`
},
{
  name: 'invert',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1,
    }
  ],
  glsl:
`   return vec4((1.0-_c0.rgb)*amount + _c0.rgb*(1.0-amount), _c0.a);`
},
{
  name: 'contrast',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 1.6,
    }
  ],
  glsl:
`   vec4 c = (_c0-vec4(0.5))*vec4(amount) + vec4(0.5);
   return vec4(c.rgb, _c0.a);`
},
{
  name: 'brightness',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 0.4,
    }
  ],
  glsl:
`   return vec4(_c0.rgb + vec3(amount), _c0.a);`
},
{
  name: 'mask',
  type: 'combine',
  inputs: [

  ],
  glsl:
`   float a = _luminance(_c1.rgb);
   return vec4(_c0.rgb*a, a);`
},
{
  name: 'luma',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'threshold',
      default: 0.5,
    },
{
      type: 'float',
      name: 'tolerance',
      default: 0.1,
    }
  ],
  glsl:
`   float a = smoothstep(threshold-tolerance, threshold+tolerance, _luminance(_c0.rgb));
   return vec4(_c0.rgb*a, a);`
},
{
  name: 'thresh',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'threshold',
      default: 0.5,
    },
{
      type: 'float',
      name: 'tolerance',
      default: 0.04,
    }
  ],
  glsl:
`   return vec4(vec3(smoothstep(threshold-tolerance, threshold+tolerance, _luminance(_c0.rgb))), _c0.a);`
},
{
  name: 'color',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'r',
      default: 1,
    },
{
      type: 'float',
      name: 'g',
      default: 1,
    },
{
      type: 'float',
      name: 'b',
      default: 1,
    },
{
      type: 'float',
      name: 'a',
      default: 1,
    }
  ],
  glsl:
`   vec4 c = vec4(r, g, b, a);
   vec4 pos = step(0.0, c); // detect whether negative
   // if > 0, return r * _c0
   // if < 0 return (1.0-r) * _c0
   return vec4(mix((1.0-_c0)*abs(c), c*_c0, pos));`
},
{
  name: 'saturate',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 2,
    }
  ],
  glsl:
`   const vec3 W = vec3(0.2125, 0.7154, 0.0721);
   vec3 intensity = vec3(dot(_c0.rgb, W));
   return vec4(mix(intensity, _c0.rgb, amount), _c0.a);`
},
{
  name: 'hue',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'hue',
      default: 0.4,
    }
  ],
  glsl:
`   vec3 c = _rgbToHsv(_c0.rgb);
   c.r += hue;
   //  c.r = fract(c.r);
   return vec4(_hsvToRgb(c), _c0.a);`
},
{
  name: 'colorama',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'amount',
      default: 0.005,
    }
  ],
  glsl:
`   vec3 c = _rgbToHsv(_c0.rgb);
   c += vec3(amount);
   c = _hsvToRgb(c);
   c = fract(c);
   return vec4(c, _c0.a);`
},
{
  name: 'prev',
  type: 'src',
  inputs: [

  ],
  glsl:
`   return texture2D(prevBuffer, fract(_st));`
},
{
  name: 'sum',
  type: 'color',
  inputs: [
    {
      type: 'vec4',
      name: 'scale',
      default: 1,
    }
  ],
  glsl:
`   vec4 v = _c0 * s;
   return v.r + v.g + v.b + v.a;
   }
   float sum(vec2 _st, vec4 s) { // vec4 is not a typo, because argument type is not overloaded
   vec2 v = _st.xy * s.xy;
   return v.x + v.y;`
},
{
  name: 'r',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   return vec4(_c0.r * scale + offset);`
},
{
  name: 'g',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   return vec4(_c0.g * scale + offset);`
},
{
  name: 'b',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   return vec4(_c0.b * scale + offset);`
},
{
  name: 'a',
  type: 'color',
  inputs: [
    {
      type: 'float',
      name: 'scale',
      default: 1,
    },
{
      type: 'float',
      name: 'offset',
      default: 0,
    }
  ],
  glsl:
`   return vec4(_c0.a * scale + offset);`
}
]

},{}],7:[function(require,module,exports){
// functions that are only used within other functions

module.exports = {
  _luminance: {
    type: 'util',
    glsl: `float _luminance(vec3 rgb){
      const vec3 W = vec3(0.2125, 0.7154, 0.0721);
      return dot(rgb, W);
    }`
  },
  _noise: {
    type: 'util',
    glsl: `
    //	Simplex 3D Noise
    //	by Ian McEwan, Ashima Arts
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

  float _noise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //  x0 = x0 - 0. + 0.0 * C
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  // Permutations
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients
  // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

  // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
  }
    `
  },


  _rgbToHsv: {
    type: 'util',
    glsl: `vec3 _rgbToHsv(vec3 c){
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }`
  },
  _hsvToRgb: {
    type: 'util',
    glsl: `vec3 _hsvToRgb(vec3 c){
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }`
  }
}

},{}],8:[function(require,module,exports){
const Webcam = require('./lib/webcam.js')
const Screen = require('./lib/screenmedia.js')

class HydraSource  {

  constructor (opts) {
    this.regl = opts.regl
    this.src = null
    this.dynamic = true
    this.width = opts.width
    this.height = opts.height
    this.tex = this.regl.texture({
      shape: [1, 1]
    //  shape: [opts.width, opts.height]
    })
    this.pb = opts.pb
  }

  init (opts) {
    if (opts.src) {
      this.src = opts.src
      this.tex = this.regl.texture(this.src)
    }
    if(opts.dynamic) this.dynamic = opts.dynamic
  }

  initCam (index) {
    const self = this
    Webcam(index).then((response) => {
      self.src = response.video
      self.tex = self.regl.texture(self.src)
    }).catch((err) => console.log('could not get camera', err))
  }

  initStream (streamName) {
  //  console.log("initing stream!", streamName)
    let self = this
    if (streamName && this.pb) {
        this.pb.initSource(streamName)

        this.pb.on("got video", function(nick, video){
          if(nick === streamName) {
            self.src = video
            self.tex = self.regl.texture(self.src)
          }
        })

    }
  }

  initScreen () {
    const self = this
    Screen().then(function (response) {
       self.src = response.video
       self.tex = self.regl.texture(self.src)
     //  console.log("received screen input")
   }).catch((err) => console.log('could not get screen', err))
  }

  resize (width, height) {
    this.width = width
    this.height = height
  }

  clear () {
    if(this.src && this.src.srcObject) {
      if (this.src.srcObject.getTracks) {
        this.src.srcObject.getTracks().forEach((track) => track.stop())
      }
    }
    this.src = null
    this.tex = this.regl.texture({
      shape: [1, 1]
    })
  }

  tick (time) {
    //  console.log(this.src, this.tex.width, this.tex.height)
    if (this.src !== null && this.dynamic === true) {
        if(this.src.videoWidth && this.src.videoWidth !== this.tex.width) {
          console.log(this.src.videoWidth, this.src.videoHeight, this.tex.width, this.tex.height)
          this.tex.resize(this.src.videoWidth, this.src.videoHeight)
        }

        if(this.src.width && this.src.width !== this.tex.width)   this.tex.resize(this.src.width, this.src.height)

        this.tex.subimage(this.src)
    }
  }

  getTexture () {
    return this.tex
  }
}

module.exports = HydraSource

},{"./lib/screenmedia.js":13,"./lib/webcam.js":15}],9:[function(require,module,exports){
// WIP utils for working with arrays
// Possibly should be integrated with lfo extension, etc.
// to do: transform time rather than array values, similar to working with coordinates in hydra

var easing = require('./easing-functions.js')

var map = (num, in_min, in_max, out_min, out_max) => {
  return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

module.exports = {
  init: () => {

    Array.prototype.fast = function(speed = 1) {
      this._speed = speed
      return this
    }

    Array.prototype.smooth = function(smooth = 1) {
      this._smooth = smooth
      return this
    }

    Array.prototype.ease = function(ease = 'linear') {
      if (typeof ease == 'function') {
        this._smooth = 1
        this._ease = ease
      }
      else if (easing[ease]){
        this._smooth = 1
        this._ease = easing[ease]
      }
      return this
    }

    Array.prototype.offset = function(offset = 0.5) {
      this._offset = offset%1.0
      return this
    }

    // Array.prototype.bounce = function() {
    //   this.modifiers.bounce = true
    //   return this
    // }

    Array.prototype.fit = function(low = 0, high =1) {
      let lowest = Math.min(...this)
      let highest =  Math.max(...this)
      var newArr = this.map((num) => map(num, lowest, highest, low, high))
      newArr._speed = this._speed
      newArr._smooth = this._smooth
      newArr._ease = this._ease
      return newArr
    }
  },

  getValue: (arr = []) => ({time, bpm}) =>{
    let speed = arr._speed ? arr._speed : 1
    let smooth = arr._smooth ? arr._smooth : 0
    let index = time * speed * (bpm / 60) + (arr._offset || 0)

    if (smooth!==0) {
      let ease = arr._ease ? arr._ease : easing['linear']
      let _index = index - (smooth / 2)
      let currValue = arr[Math.floor(_index % (arr.length))]
      let nextValue = arr[Math.floor((_index + 1) % (arr.length))]
      let t = Math.min((_index%1)/smooth,1)
      return ease(t) * (nextValue - currValue) + currValue
    }
    else {
      return arr[Math.floor(index % (arr.length))]
    }
  }
}

},{"./easing-functions.js":11}],10:[function(require,module,exports){
const Meyda = require('meyda')

class Audio {
  constructor ({
    numBins = 4,
    cutoff = 2,
    smooth = 0.4,
    max = 15,
    scale = 10,
    isDrawing = false
  }) {
    this.vol = 0
    this.scale = scale
    this.max = max
    this.cutoff = cutoff
    this.smooth = smooth
    this.setBins(numBins)

    // beat detection from: https://github.com/therewasaguy/p5-music-viz/blob/gh-pages/demos/01d_beat_detect_amplitude/sketch.js
    this.beat = {
      holdFrames: 20,
      threshold: 40,
      _cutoff: 0, // adaptive based on sound state
      decay: 0.98,
      _framesSinceBeat: 0 // keeps track of frames
    }

    this.onBeat = () => {
    //  console.log("beat")
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = 100
    this.canvas.height = 80
    this.canvas.style.width = "100px"
    this.canvas.style.height = "80px"
    this.canvas.style.position = 'absolute'
    this.canvas.style.right = '0px'
    this.canvas.style.bottom = '0px'
    document.body.appendChild(this.canvas)

    this.isDrawing = isDrawing
    this.ctx = this.canvas.getContext('2d')
    this.ctx.fillStyle="#DFFFFF"
    this.ctx.strokeStyle="#0ff"
    this.ctx.lineWidth=0.5

    window.navigator.mediaDevices.getUserMedia({video: false, audio: true})
      .then((stream) => {
      //  console.log('got mic stream', stream)
        let AudioContext = window.AudioContext || window.webkitAudioContext;
        
        this.stream = stream
        this.context = new AudioContext()
        //  this.context = new AudioContext()
        let audio_stream = this.context.createMediaStreamSource(stream)

      //  console.log(this.context)
        this.meyda = Meyda.createMeydaAnalyzer({
          audioContext: this.context,
          source: audio_stream,
          featureExtractors: [
            'loudness',
            //  'perceptualSpread',
            //  'perceptualSharpness',
            //  'spectralCentroid'
          ]
        })
      })
      .catch((err) => console.log('ERROR', err))
  }

  detectBeat (level) {
    //console.log(level,   this.beat._cutoff)
    if (level > this.beat._cutoff && level > this.beat.threshold) {
      this.onBeat()
      this.beat._cutoff = level *1.2
      this.beat._framesSinceBeat = 0
    } else {
      if (this.beat._framesSinceBeat <= this.beat.holdFrames){
        this.beat._framesSinceBeat ++;
      } else {
        this.beat._cutoff *= this.beat.decay
        this.beat._cutoff = Math.max(  this.beat._cutoff, this.beat.threshold);
      }
    }
  }

  tick() {
   if(this.meyda){
     var features = this.meyda.get()
     if(features && features !== null){
       this.vol = features.loudness.total
       this.detectBeat(this.vol)
       // reduce loudness array to number of bins
       const reducer = (accumulator, currentValue) => accumulator + currentValue;
       let spacing = Math.floor(features.loudness.specific.length/this.bins.length)
       this.prevBins = this.bins.slice(0)
       this.bins = this.bins.map((bin, index) => {
         return features.loudness.specific.slice(index * spacing, (index + 1)*spacing).reduce(reducer)
       }).map((bin, index) => {
         // map to specified range

        // return (bin * (1.0 - this.smooth) + this.prevBins[index] * this.smooth)
          return (bin * (1.0 - this.settings[index].smooth) + this.prevBins[index] * this.settings[index].smooth)
       })
       // var y = this.canvas.height - scale*this.settings[index].cutoff
       // this.ctx.beginPath()
       // this.ctx.moveTo(index*spacing, y)
       // this.ctx.lineTo((index+1)*spacing, y)
       // this.ctx.stroke()
       //
       // var yMax = this.canvas.height - scale*(this.settings[index].scale + this.settings[index].cutoff)
       this.fft = this.bins.map((bin, index) => (
        // Math.max(0, (bin - this.cutoff) / (this.max - this.cutoff))
         Math.max(0, (bin - this.settings[index].cutoff)/this.settings[index].scale)
       ))
       if(this.isDrawing) this.draw()
     }
   }
  }

  setCutoff (cutoff) {
    this.cutoff = cutoff
    this.settings = this.settings.map((el) => {
      el.cutoff = cutoff
      return el
    })
  }

  setSmooth (smooth) {
    this.smooth = smooth
    this.settings = this.settings.map((el) => {
      el.smooth = smooth
      return el
    })
  }

  setBins (numBins) {
    this.bins = Array(numBins).fill(0)
    this.prevBins = Array(numBins).fill(0)
    this.fft = Array(numBins).fill(0)
    this.settings = Array(numBins).fill(0).map(() => ({
      cutoff: this.cutoff,
      scale: this.scale,
      smooth: this.smooth
    }))
    // to do: what to do in non-global mode?
    this.bins.forEach((bin, index) => {
      window['a' + index] = (scale = 1, offset = 0) => () => (a.fft[index] * scale + offset)
    })
  //  console.log(this.settings)
  }

  setScale(scale){
    this.scale = scale
    this.settings = this.settings.map((el) => {
      el.scale = scale
      return el
    })
  }

  setMax(max) {
    this.max = max
    console.log('set max is deprecated')
  }
  hide() {
    this.isDrawing = false
    this.canvas.style.display = 'none'
  }

  show() {
    this.isDrawing = true
    this.canvas.style.display = 'block'

  }

  draw () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    var spacing = this.canvas.width / this.bins.length
    var scale = this.canvas.height / (this.max * 2)
  //  console.log(this.bins)
    this.bins.forEach((bin, index) => {

      var height = bin * scale

     this.ctx.fillRect(index * spacing, this.canvas.height - height, spacing, height)

  //   console.log(this.settings[index])
     var y = this.canvas.height - scale*this.settings[index].cutoff
     this.ctx.beginPath()
     this.ctx.moveTo(index*spacing, y)
     this.ctx.lineTo((index+1)*spacing, y)
     this.ctx.stroke()

     var yMax = this.canvas.height - scale*(this.settings[index].scale + this.settings[index].cutoff)
     this.ctx.beginPath()
     this.ctx.moveTo(index*spacing, yMax)
     this.ctx.lineTo((index+1)*spacing, yMax)
     this.ctx.stroke()
    })


    /*var y = this.canvas.height - scale*this.cutoff
    this.ctx.beginPath()
    this.ctx.moveTo(0, y)
    this.ctx.lineTo(this.canvas.width, y)
    this.ctx.stroke()
    var yMax = this.canvas.height - scale*this.max
    this.ctx.beginPath()
    this.ctx.moveTo(0, yMax)
    this.ctx.lineTo(this.canvas.width, yMax)
    this.ctx.stroke()*/
  }
}

module.exports = Audio

},{"meyda":18}],11:[function(require,module,exports){
// from https://gist.github.com/gre/1650294

module.exports = {
  // no easing, no acceleration
  linear: function (t) { return t },
  // accelerating from zero velocity
  easeInQuad: function (t) { return t*t },
  // decelerating to zero velocity
  easeOutQuad: function (t) { return t*(2-t) },
  // acceleration until halfway, then deceleration
  easeInOutQuad: function (t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t },
  // accelerating from zero velocity
  easeInCubic: function (t) { return t*t*t },
  // decelerating to zero velocity
  easeOutCubic: function (t) { return (--t)*t*t+1 },
  // acceleration until halfway, then deceleration
  easeInOutCubic: function (t) { return t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1 },
  // accelerating from zero velocity
  easeInQuart: function (t) { return t*t*t*t },
  // decelerating to zero velocity
  easeOutQuart: function (t) { return 1-(--t)*t*t*t },
  // acceleration until halfway, then deceleration
  easeInOutQuart: function (t) { return t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t },
  // accelerating from zero velocity
  easeInQuint: function (t) { return t*t*t*t*t },
  // decelerating to zero velocity
  easeOutQuint: function (t) { return 1+(--t)*t*t*t*t },
  // acceleration until halfway, then deceleration
  easeInOutQuint: function (t) { return t<.5 ? 16*t*t*t*t*t : 1+16*(--t)*t*t*t*t },
  // sin shape
  sin: function (t) { return (1 + Math.sin(Math.PI*t-Math.PI/2))/2 }
}

},{}],12:[function(require,module,exports){
// attempt custom evaluation sandbox for hydra functions
// for now, just avoids polluting the global namespace
// should probably be replaced with an abstract syntax tree

module.exports = (parent) => {
  var initialCode = ``

  var sandbox = createSandbox(initialCode)

  var addToContext = (name, object) => {
    initialCode += `
      var ${name} = ${object}
    `
    sandbox = createSandbox(initialCode)
  }


  return {
    addToContext: addToContext,
    eval: (code) => sandbox.eval(code)
  }

  function createSandbox (initial) {
    eval(initial)
    // optional params
    var localEval = function (code)  {
      eval(code)
    }

    // API/data for end-user
    return {
      eval: localEval
    }
  }
}

},{}],13:[function(require,module,exports){

module.exports = function (options) {
  return new Promise(function(resolve, reject) {
    //  async function startCapture(displayMediaOptions) {
    navigator.mediaDevices.getDisplayMedia(options).then((stream) => {
      const video = document.createElement('video')
      video.srcObject = stream
      video.addEventListener('loadedmetadata', () => {
        video.play()
        resolve({video: video})
      })
    }).catch((err) => reject(err))
  })
}

},{}],14:[function(require,module,exports){
class VideoRecorder {
  constructor(stream) {
    this.mediaSource = new MediaSource()
    this.stream = stream

    // testing using a recording as input
    this.output = document.createElement('video')
    this.output.autoplay = true
    this.output.loop = true

    let self = this
    this.mediaSource.addEventListener('sourceopen', () => {
      console.log('MediaSource opened');
      self.sourceBuffer = self.mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
      console.log('Source buffer: ', sourceBuffer);
    })
  }

  start() {
  //  let options = {mimeType: 'video/webm'};

//   let options = {mimeType: 'video/webm;codecs=h264'};
   let options = {mimeType: 'video/webm;codecs=vp9'};

    this.recordedBlobs = []
    try {
     this.mediaRecorder = new MediaRecorder(this.stream, options)
    } catch (e0) {
     console.log('Unable to create MediaRecorder with options Object: ', e0)
     try {
       options = {mimeType: 'video/webm,codecs=vp9'}
       this.mediaRecorder = new MediaRecorder(this.stream, options)
     } catch (e1) {
       console.log('Unable to create MediaRecorder with options Object: ', e1)
       try {
         options = 'video/vp8' // Chrome 47
         this.mediaRecorder = new MediaRecorder(this.stream, options)
       } catch (e2) {
         alert('MediaRecorder is not supported by this browser.\n\n' +
           'Try Firefox 29 or later, or Chrome 47 or later, ' +
           'with Enable experimental Web Platform features enabled from chrome://flags.')
         console.error('Exception while creating MediaRecorder:', e2)
         return
       }
     }
   }
   console.log('Created MediaRecorder', this.mediaRecorder, 'with options', options);
   this.mediaRecorder.onstop = this._handleStop.bind(this)
   this.mediaRecorder.ondataavailable = this._handleDataAvailable.bind(this)
   this.mediaRecorder.start(100) // collect 100ms of data
   console.log('MediaRecorder started', this.mediaRecorder)
 }

  
   stop(){
     this.mediaRecorder.stop()
   }

 _handleStop() {
   //const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'})
   // const blob = new Blob(this.recordedBlobs, {type: 'video/webm;codecs=h264'})
  const blob = new Blob(this.recordedBlobs, {type: this.mediaRecorder.mimeType})
   const url = window.URL.createObjectURL(blob)
   this.output.src = url

    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = url
    let d = new Date()
    a.download = `hydra-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}.${d.getMinutes()}.${d.getSeconds()}.webm`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 300);
  }

  _handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
      this.recordedBlobs.push(event.data);
    }
  }
}

module.exports = VideoRecorder

},{}],15:[function(require,module,exports){
//const enumerateDevices = require('enumerate-devices')

module.exports = function (deviceId) {
  return navigator.mediaDevices.enumerateDevices()
    .then(devices => devices.filter(devices => devices.kind === 'videoinput'))
    .then(cameras => {
      let constraints = { audio: false, video: true}
      if (cameras[deviceId]) {
        constraints['video'] = {
          deviceId: { exact: cameras[deviceId].deviceId }
        }
      }
    //  console.log(cameras)
      return window.navigator.mediaDevices.getUserMedia(constraints)
    })
    .then(stream => {
      const video = document.createElement('video')
      //  video.src = window.URL.createObjectURL(stream)
      video.srcObject = stream
      return new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => {
          video.play().then(() => resolve({video: video}))
        })
      })
    })
    .catch(console.log.bind(console))
}

},{}],16:[function(require,module,exports){
//const transforms = require('./glsl-transforms.js')

var Output = function (opts) {
  this.regl = opts.regl
  this.precision = opts.precision
  this.positionBuffer = this.regl.buffer([
    [-2, 0],
    [0, -2],
    [2, 2]
  ])

  this.draw = () => {}
  this.init()
  this.pingPongIndex = 0

  // for each output, create two fbos for pingponging
  this.fbos = (Array(2)).fill().map(() => this.regl.framebuffer({
    color: this.regl.texture({
      mag: 'nearest',
      width: opts.width,
      height: opts.height,
      format: 'rgba'
    }),
    depthStencil: false
  }))

  // array containing render passes
//  this.passes = []
}

Output.prototype.resize = function(width, height) {
  this.fbos.forEach((fbo) => {
    fbo.resize(width, height)
  })
//  console.log(this)
}


Output.prototype.getCurrent = function () {
  return this.fbos[this.pingPongIndex]
}

Output.prototype.getTexture = function () {
   var index = this.pingPongIndex ? 0 : 1
  return this.fbos[index]
}

Output.prototype.init = function () {
//  console.log('clearing')
  this.transformIndex = 0
  this.fragHeader = `
  precision ${this.precision} float;

  uniform float time;
  varying vec2 uv;
  `
  this.fragBody = ``

  this.vert = `
  precision ${this.precision} float;
  attribute vec2 position;
  varying vec2 uv;

  void main () {
    uv = position;
    gl_Position = vec4(2.0 * position - 1.0, 0, 1);
  }`

  this.attributes = {
    position: this.positionBuffer
  }
  this.uniforms = {
    time: this.regl.prop('time'),
    resolution: this.regl.prop('resolution')
  }

  this.frag = `
       ${this.fragHeader}

      void main () {
        vec4 c = vec4(0, 0, 0, 0);
        vec2 st = uv;
        ${this.fragBody}
        gl_FragColor = c;
      }
  `
  return this
}


Output.prototype.render = function (passes) {
  let pass = passes[0]
  //console.log('pass', pass, this.pingPongIndex)
  var self = this
      var uniforms = Object.assign(pass.uniforms, { prevBuffer:  () =>  {
             //var index = this.pingPongIndex ? 0 : 1
          //   var index = self.pingPong[(passIndex+1)%2]
          //  console.log('ping pong', self.pingPongIndex)
            return self.fbos[self.pingPongIndex]
          }
        })

  self.draw = self.regl({
    frag: pass.frag,
    vert: self.vert,
    attributes: self.attributes,
    uniforms: uniforms,
    count: 3,
    framebuffer: () => {
      self.pingPongIndex = self.pingPongIndex ? 0 : 1
      return self.fbos[self.pingPongIndex]
    }
  })
}


Output.prototype.tick = function (props) {
//  console.log(props)
  this.draw(props)
}

module.exports = Output

},{}],17:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],18:[function(require,module,exports){
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["Meyda"] = factory();
	else
		root["Meyda"] = factory();
})(window, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/index.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./node_modules/assert/assert.js":
/*!***************************************!*\
  !*** ./node_modules/assert/assert.js ***!
  \***************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(global) {

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = __webpack_require__(/*! util/ */ "./node_modules/webpack-stream/node_modules/util/util.js");
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = (function () {
  return function foo() {}.name === 'foo';
}());
function pToString (obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' +  name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' +
         self.operator + ' ' +
         truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if ((actual === null || typeof actual !== 'object') &&
             (expected === null || typeof expected !== 'object')) {
    return strict ? actual === expected : actual == expected;

  // If both values are instances of typed arrays, wrap their underlying
  // ArrayBuffers in a Buffer each to increase performance
  // This optimization requires the arrays to have the same type as checked by
  // Object.prototype.toString (aka pToString). Never perform binary
  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
  // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) &&
             pToString(actual) === pToString(expected) &&
             !(actual instanceof Float32Array ||
               actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer),
                   new Uint8Array(expected.buffer)) === 0;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || {actual: [], expected: []};

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b))
    return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
      return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}


// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if ((isUnwantedException &&
      userProvidedMessage &&
      expectedException(actual, expected)) ||
      isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function(err) { if (err) throw err; };

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../webpack-stream/node_modules/webpack/buildin/global.js */ "./node_modules/webpack-stream/node_modules/webpack/buildin/global.js")))

/***/ }),

/***/ "./node_modules/dct/index.js":
/*!***********************************!*\
  !*** ./node_modules/dct/index.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

module.exports = __webpack_require__(/*! ./src/dct.js */ "./node_modules/dct/src/dct.js");


/***/ }),

/***/ "./node_modules/dct/src/dct.js":
/*!*************************************!*\
  !*** ./node_modules/dct/src/dct.js ***!
  \*************************************/
/*! no static exports found */
/***/ (function(module, exports) {

/*===========================================================================*\
 * Discrete Cosine Transform
 *
 * (c) Vail Systems. Joshua Jung and Ben Bryan. 2015
 *
 * This code is not designed to be highly optimized but as an educational
 * tool to understand the Mel-scale and its related coefficients used in
 * human speech analysis.
\*===========================================================================*/
var cosMap = null;

// Builds a cosine map for the given input size. This allows multiple input sizes to be memoized automagically
// if you want to run the DCT over and over.
var memoizeCosines = function(N) {
  cosMap = cosMap || {};
  cosMap[N] = new Array(N*N);

  var PI_N = Math.PI / N;

  for (var k = 0; k < N; k++) {
    for (var n = 0; n < N; n++) {
      cosMap[N][n + (k * N)] = Math.cos(PI_N * (n + 0.5) * k);
    }
  }
};

function dct(signal, scale) {
  var L = signal.length;
  scale = scale || 2;

  if (!cosMap || !cosMap[L]) memoizeCosines(L);

  var coefficients = signal.map(function () {return 0;});

  return coefficients.map(function (__, ix) {
    return scale * signal.reduce(function (prev, cur, ix_, arr) {
      return prev + (cur * cosMap[L][ix_ + (ix * L)]);
    }, 0);
  });
};

module.exports = dct;


/***/ }),

/***/ "./node_modules/fftjs/dist/fft.js":
/*!****************************************!*\
  !*** ./node_modules/fftjs/dist/fft.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var utils = __webpack_require__(/*! ./utils */ "./node_modules/fftjs/dist/utils.js");

// real to complex fft
var fft = function fft(signal) {

  var complexSignal = {};

  if (signal.real === undefined || signal.imag === undefined) {
    complexSignal = utils.constructComplexArray(signal);
  } else {
    complexSignal.real = signal.real.slice();
    complexSignal.imag = signal.imag.slice();
  }

  var N = complexSignal.real.length;
  var logN = Math.log2(N);

  if (Math.round(logN) != logN) throw new Error('Input size must be a power of 2.');

  if (complexSignal.real.length != complexSignal.imag.length) {
    throw new Error('Real and imaginary components must have the same length.');
  }

  var bitReversedIndices = utils.bitReverseArray(N);

  // sort array
  var ordered = {
    'real': [],
    'imag': []
  };

  for (var i = 0; i < N; i++) {
    ordered.real[bitReversedIndices[i]] = complexSignal.real[i];
    ordered.imag[bitReversedIndices[i]] = complexSignal.imag[i];
  }

  for (var _i = 0; _i < N; _i++) {
    complexSignal.real[_i] = ordered.real[_i];
    complexSignal.imag[_i] = ordered.imag[_i];
  }
  // iterate over the number of stages
  for (var n = 1; n <= logN; n++) {
    var currN = Math.pow(2, n);

    // find twiddle factors
    for (var k = 0; k < currN / 2; k++) {
      var twiddle = utils.euler(k, currN);

      // on each block of FT, implement the butterfly diagram
      for (var m = 0; m < N / currN; m++) {
        var currEvenIndex = currN * m + k;
        var currOddIndex = currN * m + k + currN / 2;

        var currEvenIndexSample = {
          'real': complexSignal.real[currEvenIndex],
          'imag': complexSignal.imag[currEvenIndex]
        };
        var currOddIndexSample = {
          'real': complexSignal.real[currOddIndex],
          'imag': complexSignal.imag[currOddIndex]
        };

        var odd = utils.multiply(twiddle, currOddIndexSample);

        var subtractionResult = utils.subtract(currEvenIndexSample, odd);
        complexSignal.real[currOddIndex] = subtractionResult.real;
        complexSignal.imag[currOddIndex] = subtractionResult.imag;

        var additionResult = utils.add(odd, currEvenIndexSample);
        complexSignal.real[currEvenIndex] = additionResult.real;
        complexSignal.imag[currEvenIndex] = additionResult.imag;
      }
    }
  }

  return complexSignal;
};

// complex to real ifft
var ifft = function ifft(signal) {

  if (signal.real === undefined || signal.imag === undefined) {
    throw new Error("IFFT only accepts a complex input.");
  }

  var N = signal.real.length;

  var complexSignal = {
    'real': [],
    'imag': []
  };

  //take complex conjugate in order to be able to use the regular FFT for IFFT
  for (var i = 0; i < N; i++) {
    var currentSample = {
      'real': signal.real[i],
      'imag': signal.imag[i]
    };

    var conjugateSample = utils.conj(currentSample);
    complexSignal.real[i] = conjugateSample.real;
    complexSignal.imag[i] = conjugateSample.imag;
  }

  //compute
  var X = fft(complexSignal);

  //normalize
  complexSignal.real = X.real.map(function (val) {
    return val / N;
  });

  complexSignal.imag = X.imag.map(function (val) {
    return val / N;
  });

  return complexSignal;
};

module.exports = {
  fft: fft,
  ifft: ifft
};

/***/ }),

/***/ "./node_modules/fftjs/dist/utils.js":
/*!******************************************!*\
  !*** ./node_modules/fftjs/dist/utils.js ***!
  \******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// memoization of the reversal of different lengths.

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var memoizedReversal = {};
var memoizedZeroBuffers = {};

var constructComplexArray = function constructComplexArray(signal) {
  var complexSignal = {};

  complexSignal.real = signal.real === undefined ? signal.slice() : signal.real.slice();

  var bufferSize = complexSignal.real.length;

  if (memoizedZeroBuffers[bufferSize] === undefined) {
    memoizedZeroBuffers[bufferSize] = Array.apply(null, Array(bufferSize)).map(Number.prototype.valueOf, 0);
  }

  complexSignal.imag = memoizedZeroBuffers[bufferSize].slice();

  return complexSignal;
};

var bitReverseArray = function bitReverseArray(N) {
  if (memoizedReversal[N] === undefined) {
    var maxBinaryLength = (N - 1).toString(2).length; //get the binary length of the largest index.
    var templateBinary = '0'.repeat(maxBinaryLength); //create a template binary of that length.
    var reversed = {};
    for (var n = 0; n < N; n++) {
      var currBinary = n.toString(2); //get binary value of current index.

      //prepend zeros from template to current binary. This makes binary values of all indices have the same length.
      currBinary = templateBinary.substr(currBinary.length) + currBinary;

      currBinary = [].concat(_toConsumableArray(currBinary)).reverse().join(''); //reverse
      reversed[n] = parseInt(currBinary, 2); //convert to decimal
    }
    memoizedReversal[N] = reversed; //save
  }
  return memoizedReversal[N];
};

// complex multiplication
var multiply = function multiply(a, b) {
  return {
    'real': a.real * b.real - a.imag * b.imag,
    'imag': a.real * b.imag + a.imag * b.real
  };
};

// complex addition
var add = function add(a, b) {
  return {
    'real': a.real + b.real,
    'imag': a.imag + b.imag
  };
};

// complex subtraction
var subtract = function subtract(a, b) {
  return {
    'real': a.real - b.real,
    'imag': a.imag - b.imag
  };
};

// euler's identity e^x = cos(x) + sin(x)
var euler = function euler(kn, N) {
  var x = -2 * Math.PI * kn / N;
  return { 'real': Math.cos(x), 'imag': Math.sin(x) };
};

// complex conjugate
var conj = function conj(a) {
  a.imag *= -1;
  return a;
};

module.exports = {
  bitReverseArray: bitReverseArray,
  multiply: multiply,
  add: add,
  subtract: subtract,
  euler: euler,
  conj: conj,
  constructComplexArray: constructComplexArray
};

/***/ }),

/***/ "./node_modules/inherits/inherits_browser.js":
/*!***************************************************!*\
  !*** ./node_modules/inherits/inherits_browser.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}


/***/ }),

/***/ "./node_modules/process/browser.js":
/*!*****************************************!*\
  !*** ./node_modules/process/browser.js ***!
  \*****************************************/
/*! no static exports found */
/***/ (function(module, exports) {

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };


/***/ }),

/***/ "./node_modules/webpack-stream/node_modules/util/support/isBufferBrowser.js":
/*!**********************************************************************************!*\
  !*** ./node_modules/webpack-stream/node_modules/util/support/isBufferBrowser.js ***!
  \**********************************************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}

/***/ }),

/***/ "./node_modules/webpack-stream/node_modules/util/util.js":
/*!***************************************************************!*\
  !*** ./node_modules/webpack-stream/node_modules/util/util.js ***!
  \***************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(process) {// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  if (typeof process !== 'undefined' && process.noDeprecation === true) {
    return fn;
  }

  // Allow for deprecating things in the process of starting up.
  if (typeof process === 'undefined') {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = __webpack_require__(/*! ./support/isBuffer */ "./node_modules/webpack-stream/node_modules/util/support/isBufferBrowser.js");

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = __webpack_require__(/*! inherits */ "./node_modules/inherits/inherits_browser.js");

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

exports.promisify = function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

exports.promisify.custom = kCustomPromisifiedSymbol

function callbackifyOnRejected(reason, cb) {
  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    var newReason = new Error('Promise was rejected with a falsy value');
    newReason.reason = reason;
    reason = newReason;
  }
  return cb(reason);
}

function callbackify(original) {
  if (typeof original !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }

  // We DO NOT return the promise as it gives the user a false sense that
  // the promise is actually somehow related to the callback's execution
  // and that the callback throwing will reject the promise.
  function callbackified() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var maybeCb = args.pop();
    if (typeof maybeCb !== 'function') {
      throw new TypeError('The last argument must be of type Function');
    }
    var self = this;
    var cb = function() {
      return maybeCb.apply(self, arguments);
    };
    // In true node style we process the callback on `nextTick` with all the
    // implications (stack, `uncaughtException`, `async_hooks`)
    original.apply(this, args)
      .then(function(ret) { process.nextTick(cb, null, ret) },
            function(rej) { process.nextTick(callbackifyOnRejected, rej, cb) });
  }

  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
  Object.defineProperties(callbackified,
                          getOwnPropertyDescriptors(original));
  return callbackified;
}
exports.callbackify = callbackify;

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../../../process/browser.js */ "./node_modules/process/browser.js")))

/***/ }),

/***/ "./node_modules/webpack-stream/node_modules/webpack/buildin/global.js":
/*!***********************************!*\
  !*** (webpack)/buildin/global.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports) {

var g;

// This works in non-strict mode
g = (function() {
	return this;
})();

try {
	// This works if eval is allowed (see CSP)
	g = g || new Function("return this")();
} catch (e) {
	// This works if the window reference is available
	if (typeof window === "object") g = window;
}

// g can still be undefined, but nothing to do about it...
// We return undefined, instead of nothing here, so it's
// easier to handle this case. if(!global) { ...}

module.exports = g;


/***/ }),

/***/ "./src/extractors/chroma.js":
/*!**********************************!*\
  !*** ./src/extractors/chroma.js ***!
  \**********************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object') {
    throw new TypeError('Valid ampSpectrum is required to generate chroma');
  }

  if (_typeof(args.chromaFilterBank) !== 'object') {
    throw new TypeError('Valid chromaFilterBank is required to generate chroma');
  }

  var chromagram = args.chromaFilterBank.map(function (row, i) {
    return args.ampSpectrum.reduce(function (acc, v, j) {
      return acc + v * row[j];
    }, 0);
  });
  var maxVal = Math.max.apply(Math, _toConsumableArray(chromagram));
  return maxVal ? chromagram.map(function (v) {
    return v / maxVal;
  }) : chromagram;
});

/***/ }),

/***/ "./src/extractors/energy.js":
/*!**********************************!*\
  !*** ./src/extractors/energy.js ***!
  \**********************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var assert__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! assert */ "./node_modules/assert/assert.js");
/* harmony import */ var assert__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(assert__WEBPACK_IMPORTED_MODULE_0__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].signal) !== 'object') {
    throw new TypeError();
  }

  var energy = 0;

  for (var i = 0; i < arguments[0].signal.length; i++) {
    energy += Math.pow(Math.abs(arguments[0].signal[i]), 2);
  }

  return energy;
});

/***/ }),

/***/ "./src/extractors/extractorUtilities.js":
/*!**********************************************!*\
  !*** ./src/extractors/extractorUtilities.js ***!
  \**********************************************/
/*! exports provided: mu */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "mu", function() { return mu; });
function mu(i, amplitudeSpect) {
  var numerator = 0;
  var denominator = 0;

  for (var k = 0; k < amplitudeSpect.length; k++) {
    numerator += Math.pow(k, i) * Math.abs(amplitudeSpect[k]);
    denominator += amplitudeSpect[k];
  }

  return numerator / denominator;
}

/***/ }),

/***/ "./src/extractors/loudness.js":
/*!************************************!*\
  !*** ./src/extractors/loudness.js ***!
  \************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object' || _typeof(args.barkScale) !== 'object') {
    throw new TypeError();
  }

  var NUM_BARK_BANDS = 24;
  var specific = new Float32Array(NUM_BARK_BANDS);
  var total = 0;
  var normalisedSpectrum = args.ampSpectrum;
  var bbLimits = new Int32Array(NUM_BARK_BANDS + 1);
  bbLimits[0] = 0;
  var currentBandEnd = args.barkScale[normalisedSpectrum.length - 1] / NUM_BARK_BANDS;
  var currentBand = 1;

  for (var i = 0; i < normalisedSpectrum.length; i++) {
    while (args.barkScale[i] > currentBandEnd) {
      bbLimits[currentBand++] = i;
      currentBandEnd = currentBand * args.barkScale[normalisedSpectrum.length - 1] / NUM_BARK_BANDS;
    }
  }

  bbLimits[NUM_BARK_BANDS] = normalisedSpectrum.length - 1; //process

  for (var _i = 0; _i < NUM_BARK_BANDS; _i++) {
    var sum = 0;

    for (var j = bbLimits[_i]; j < bbLimits[_i + 1]; j++) {
      sum += normalisedSpectrum[j];
    }

    specific[_i] = Math.pow(sum, 0.23);
  } //get total loudness


  for (var _i2 = 0; _i2 < specific.length; _i2++) {
    total += specific[_i2];
  }

  return {
    specific: specific,
    total: total
  };
});

/***/ }),

/***/ "./src/extractors/mfcc.js":
/*!********************************!*\
  !*** ./src/extractors/mfcc.js ***!
  \********************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _powerSpectrum__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./powerSpectrum */ "./src/extractors/powerSpectrum.js");
/* harmony import */ var _utilities__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./../utilities */ "./src/utilities.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }





var dct = __webpack_require__(/*! dct */ "./node_modules/dct/index.js");

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object') {
    throw new TypeError('Valid ampSpectrum is required to generate MFCC');
  }

  if (_typeof(args.melFilterBank) !== 'object') {
    throw new TypeError('Valid melFilterBank is required to generate MFCC');
  }

  var numberOfMFCCCoefficients = Math.min(40, Math.max(1, args.numberOfMFCCCoefficients || 13)); // Tutorial from:
  // http://practicalcryptography.com/miscellaneous/machine-learning
  // /guide-mel-frequency-cepstral-coefficients-mfccs/

  var powSpec = Object(_powerSpectrum__WEBPACK_IMPORTED_MODULE_0__["default"])(args);
  var numFilters = args.melFilterBank.length;
  var filtered = Array(numFilters);

  if (numFilters < numberOfMFCCCoefficients) {
    throw new Error("Insufficient filter bank for requested number of coefficients");
  }

  var loggedMelBands = new Float32Array(numFilters);

  for (var i = 0; i < loggedMelBands.length; i++) {
    filtered[i] = new Float32Array(args.bufferSize / 2);
    loggedMelBands[i] = 0;

    for (var j = 0; j < args.bufferSize / 2; j++) {
      //point-wise multiplication between power spectrum and filterbanks.
      filtered[i][j] = args.melFilterBank[i][j] * powSpec[j]; //summing up all of the coefficients into one array

      loggedMelBands[i] += filtered[i][j];
    } //log each coefficient.


    loggedMelBands[i] = Math.log(loggedMelBands[i] + 1);
  } //dct


  var loggedMelBandsArray = Array.prototype.slice.call(loggedMelBands);
  var mfccs = dct(loggedMelBandsArray).slice(0, numberOfMFCCCoefficients);
  return mfccs;
});

/***/ }),

/***/ "./src/extractors/perceptualSharpness.js":
/*!***********************************************!*\
  !*** ./src/extractors/perceptualSharpness.js ***!
  \***********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _loudness__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./loudness */ "./src/extractors/loudness.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].signal) !== 'object') {
    throw new TypeError();
  }

  var loudnessValue = Object(_loudness__WEBPACK_IMPORTED_MODULE_0__["default"])(arguments[0]);
  var spec = loudnessValue.specific;
  var output = 0;

  for (var i = 0; i < spec.length; i++) {
    if (i < 15) {
      output += (i + 1) * spec[i + 1];
    } else {
      output += 0.066 * Math.exp(0.171 * (i + 1));
    }
  }

  output *= 0.11 / loudnessValue.total;
  return output;
});

/***/ }),

/***/ "./src/extractors/perceptualSpread.js":
/*!********************************************!*\
  !*** ./src/extractors/perceptualSpread.js ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _loudness__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./loudness */ "./src/extractors/loudness.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].signal) !== 'object') {
    throw new TypeError();
  }

  var loudnessValue = Object(_loudness__WEBPACK_IMPORTED_MODULE_0__["default"])(arguments[0]);
  var max = 0;

  for (var i = 0; i < loudnessValue.specific.length; i++) {
    if (loudnessValue.specific[i] > max) {
      max = loudnessValue.specific[i];
    }
  }

  var spread = Math.pow((loudnessValue.total - max) / loudnessValue.total, 2);
  return spread;
});

/***/ }),

/***/ "./src/extractors/powerSpectrum.js":
/*!*****************************************!*\
  !*** ./src/extractors/powerSpectrum.js ***!
  \*****************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  var powerSpectrum = new Float32Array(arguments[0].ampSpectrum.length);

  for (var i = 0; i < powerSpectrum.length; i++) {
    powerSpectrum[i] = Math.pow(arguments[0].ampSpectrum[i], 2);
  }

  return powerSpectrum;
});

/***/ }),

/***/ "./src/extractors/rms.js":
/*!*******************************!*\
  !*** ./src/extractors/rms.js ***!
  \*******************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.signal) !== 'object') {
    throw new TypeError();
  }

  var rms = 0;

  for (var i = 0; i < args.signal.length; i++) {
    rms += Math.pow(args.signal[i], 2);
  }

  rms = rms / args.signal.length;
  rms = Math.sqrt(rms);
  return rms;
});

/***/ }),

/***/ "./src/extractors/spectralCentroid.js":
/*!********************************************!*\
  !*** ./src/extractors/spectralCentroid.js ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _extractorUtilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./extractorUtilities */ "./src/extractors/extractorUtilities.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  return Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(1, arguments[0].ampSpectrum);
});

/***/ }),

/***/ "./src/extractors/spectralFlatness.js":
/*!********************************************!*\
  !*** ./src/extractors/spectralFlatness.js ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  var numerator = 0;
  var denominator = 0;

  for (var i = 0; i < arguments[0].ampSpectrum.length; i++) {
    numerator += Math.log(arguments[0].ampSpectrum[i]);
    denominator += arguments[0].ampSpectrum[i];
  }

  return Math.exp(numerator / arguments[0].ampSpectrum.length) * arguments[0].ampSpectrum.length / denominator;
});

/***/ }),

/***/ "./src/extractors/spectralFlux.js":
/*!****************************************!*\
  !*** ./src/extractors/spectralFlux.js ***!
  \****************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.signal) !== 'object' || _typeof(args.previousSignal) != 'object') {
    throw new TypeError();
  }

  var sf = 0;

  for (var i = -(args.bufferSize / 2); i < signal.length / 2 - 1; i++) {
    x = Math.abs(args.signal[i]) - Math.abs(args.previousSignal[i]);
    sf += (x + Math.abs(x)) / 2;
  }

  return sf;
});

/***/ }),

/***/ "./src/extractors/spectralKurtosis.js":
/*!********************************************!*\
  !*** ./src/extractors/spectralKurtosis.js ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _extractorUtilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./extractorUtilities */ "./src/extractors/extractorUtilities.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  var ampspec = arguments[0].ampSpectrum;
  var mu1 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(1, ampspec);
  var mu2 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(2, ampspec);
  var mu3 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(3, ampspec);
  var mu4 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(4, ampspec);
  var numerator = -3 * Math.pow(mu1, 4) + 6 * mu1 * mu2 - 4 * mu1 * mu3 + mu4;
  var denominator = Math.pow(Math.sqrt(mu2 - Math.pow(mu1, 2)), 4);
  return numerator / denominator;
});

/***/ }),

/***/ "./src/extractors/spectralRolloff.js":
/*!*******************************************!*\
  !*** ./src/extractors/spectralRolloff.js ***!
  \*******************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  var ampspec = arguments[0].ampSpectrum; //calculate nyquist bin

  var nyqBin = arguments[0].sampleRate / (2 * (ampspec.length - 1));
  var ec = 0;

  for (var i = 0; i < ampspec.length; i++) {
    ec += ampspec[i];
  }

  var threshold = 0.99 * ec;
  var n = ampspec.length - 1;

  while (ec > threshold && n >= 0) {
    ec -= ampspec[n];
    --n;
  }

  return (n + 1) * nyqBin;
});

/***/ }),

/***/ "./src/extractors/spectralSkewness.js":
/*!********************************************!*\
  !*** ./src/extractors/spectralSkewness.js ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _extractorUtilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./extractorUtilities */ "./src/extractors/extractorUtilities.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  var mu1 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(1, args.ampSpectrum);
  var mu2 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(2, args.ampSpectrum);
  var mu3 = Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(3, args.ampSpectrum);
  var numerator = 2 * Math.pow(mu1, 3) - 3 * mu1 * mu2 + mu3;
  var denominator = Math.pow(Math.sqrt(mu2 - Math.pow(mu1, 2)), 3);
  return numerator / denominator;
});

/***/ }),

/***/ "./src/extractors/spectralSlope.js":
/*!*****************************************!*\
  !*** ./src/extractors/spectralSlope.js ***!
  \*****************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object') {
    throw new TypeError();
  } //linear regression


  var ampSum = 0;
  var freqSum = 0;
  var freqs = new Float32Array(args.ampSpectrum.length);
  var powFreqSum = 0;
  var ampFreqSum = 0;

  for (var i = 0; i < args.ampSpectrum.length; i++) {
    ampSum += args.ampSpectrum[i];
    var curFreq = i * args.sampleRate / args.bufferSize;
    freqs[i] = curFreq;
    powFreqSum += curFreq * curFreq;
    freqSum += curFreq;
    ampFreqSum += curFreq * args.ampSpectrum[i];
  }

  return (args.ampSpectrum.length * ampFreqSum - freqSum * ampSum) / (ampSum * (powFreqSum - Math.pow(freqSum, 2)));
});

/***/ }),

/***/ "./src/extractors/spectralSpread.js":
/*!******************************************!*\
  !*** ./src/extractors/spectralSpread.js ***!
  \******************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _extractorUtilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./extractorUtilities */ "./src/extractors/extractorUtilities.js");
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }


/* harmony default export */ __webpack_exports__["default"] = (function (args) {
  if (_typeof(args.ampSpectrum) !== 'object') {
    throw new TypeError();
  }

  return Math.sqrt(Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(2, args.ampSpectrum) - Math.pow(Object(_extractorUtilities__WEBPACK_IMPORTED_MODULE_0__["mu"])(1, args.ampSpectrum), 2));
});

/***/ }),

/***/ "./src/extractors/zcr.js":
/*!*******************************!*\
  !*** ./src/extractors/zcr.js ***!
  \*******************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* harmony default export */ __webpack_exports__["default"] = (function () {
  if (_typeof(arguments[0].signal) !== 'object') {
    throw new TypeError();
  }

  var zcr = 0;

  for (var i = 1; i < arguments[0].signal.length; i++) {
    if (arguments[0].signal[i - 1] >= 0 && arguments[0].signal[i] < 0 || arguments[0].signal[i - 1] < 0 && arguments[0].signal[i] >= 0) {
      zcr++;
    }
  }

  return zcr;
});

/***/ }),

/***/ "./src/featureExtractors.js":
/*!**********************************!*\
  !*** ./src/featureExtractors.js ***!
  \**********************************/
/*! exports provided: buffer, rms, energy, complexSpectrum, spectralSlope, spectralCentroid, spectralRolloff, spectralFlatness, spectralSpread, spectralSkewness, spectralKurtosis, amplitudeSpectrum, zcr, loudness, perceptualSpread, perceptualSharpness, powerSpectrum, mfcc, chroma, spectralFlux */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "buffer", function() { return buffer; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "complexSpectrum", function() { return complexSpectrum; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "amplitudeSpectrum", function() { return amplitudeSpectrum; });
/* harmony import */ var _extractors_rms__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./extractors/rms */ "./src/extractors/rms.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "rms", function() { return _extractors_rms__WEBPACK_IMPORTED_MODULE_0__["default"]; });

/* harmony import */ var _extractors_energy__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./extractors/energy */ "./src/extractors/energy.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "energy", function() { return _extractors_energy__WEBPACK_IMPORTED_MODULE_1__["default"]; });

/* harmony import */ var _extractors_spectralSlope__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./extractors/spectralSlope */ "./src/extractors/spectralSlope.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralSlope", function() { return _extractors_spectralSlope__WEBPACK_IMPORTED_MODULE_2__["default"]; });

/* harmony import */ var _extractors_spectralCentroid__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./extractors/spectralCentroid */ "./src/extractors/spectralCentroid.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralCentroid", function() { return _extractors_spectralCentroid__WEBPACK_IMPORTED_MODULE_3__["default"]; });

/* harmony import */ var _extractors_spectralRolloff__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./extractors/spectralRolloff */ "./src/extractors/spectralRolloff.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralRolloff", function() { return _extractors_spectralRolloff__WEBPACK_IMPORTED_MODULE_4__["default"]; });

/* harmony import */ var _extractors_spectralFlatness__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./extractors/spectralFlatness */ "./src/extractors/spectralFlatness.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralFlatness", function() { return _extractors_spectralFlatness__WEBPACK_IMPORTED_MODULE_5__["default"]; });

/* harmony import */ var _extractors_spectralSpread__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./extractors/spectralSpread */ "./src/extractors/spectralSpread.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralSpread", function() { return _extractors_spectralSpread__WEBPACK_IMPORTED_MODULE_6__["default"]; });

/* harmony import */ var _extractors_spectralSkewness__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./extractors/spectralSkewness */ "./src/extractors/spectralSkewness.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralSkewness", function() { return _extractors_spectralSkewness__WEBPACK_IMPORTED_MODULE_7__["default"]; });

/* harmony import */ var _extractors_spectralKurtosis__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./extractors/spectralKurtosis */ "./src/extractors/spectralKurtosis.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralKurtosis", function() { return _extractors_spectralKurtosis__WEBPACK_IMPORTED_MODULE_8__["default"]; });

/* harmony import */ var _extractors_zcr__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./extractors/zcr */ "./src/extractors/zcr.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "zcr", function() { return _extractors_zcr__WEBPACK_IMPORTED_MODULE_9__["default"]; });

/* harmony import */ var _extractors_loudness__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./extractors/loudness */ "./src/extractors/loudness.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "loudness", function() { return _extractors_loudness__WEBPACK_IMPORTED_MODULE_10__["default"]; });

/* harmony import */ var _extractors_perceptualSpread__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./extractors/perceptualSpread */ "./src/extractors/perceptualSpread.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "perceptualSpread", function() { return _extractors_perceptualSpread__WEBPACK_IMPORTED_MODULE_11__["default"]; });

/* harmony import */ var _extractors_perceptualSharpness__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./extractors/perceptualSharpness */ "./src/extractors/perceptualSharpness.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "perceptualSharpness", function() { return _extractors_perceptualSharpness__WEBPACK_IMPORTED_MODULE_12__["default"]; });

/* harmony import */ var _extractors_mfcc__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./extractors/mfcc */ "./src/extractors/mfcc.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "mfcc", function() { return _extractors_mfcc__WEBPACK_IMPORTED_MODULE_13__["default"]; });

/* harmony import */ var _extractors_chroma__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ./extractors/chroma */ "./src/extractors/chroma.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "chroma", function() { return _extractors_chroma__WEBPACK_IMPORTED_MODULE_14__["default"]; });

/* harmony import */ var _extractors_powerSpectrum__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ./extractors/powerSpectrum */ "./src/extractors/powerSpectrum.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "powerSpectrum", function() { return _extractors_powerSpectrum__WEBPACK_IMPORTED_MODULE_15__["default"]; });

/* harmony import */ var _extractors_spectralFlux__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! ./extractors/spectralFlux */ "./src/extractors/spectralFlux.js");
/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, "spectralFlux", function() { return _extractors_spectralFlux__WEBPACK_IMPORTED_MODULE_16__["default"]; });



















var buffer = function buffer(args) {
  return args.signal;
};

var complexSpectrum = function complexSpectrum(args) {
  return args.complexSpectrum;
};

var amplitudeSpectrum = function amplitudeSpectrum(args) {
  return args.ampSpectrum;
};



/***/ }),

/***/ "./src/index.js":
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

module.exports = __webpack_require__(/*! ./main */ "./src/main.js")["default"];

/***/ }),

/***/ "./src/main.js":
/*!*********************!*\
  !*** ./src/main.js ***!
  \*********************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _utilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utilities */ "./src/utilities.js");
/* harmony import */ var _featureExtractors__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./featureExtractors */ "./src/featureExtractors.js");
/* harmony import */ var fftjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! fftjs */ "./node_modules/fftjs/dist/fft.js");
/* harmony import */ var fftjs__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(fftjs__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _meyda_wa__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./meyda-wa */ "./src/meyda-wa.js");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }





/**
 * Meyda Module
 * @module meyda
 */

/**
 * Options for constructing a MeydaAnalyzer
 * @typedef {Object} MeydaOptions
 * @property {AudioContext} audioContext - The Audio Context for the MeydaAnalyzer to operate in.
 * @property {AudioNode} source - The Audio Node for Meyda to listen to.
 * @property {number} [bufferSize] - The size of the buffer.
 * @property {number} [hopSize] - The hop size between buffers.
 * @property {number} [sampleRate] - The number of samples per second in the audio context.
 * @property {Function} [callback] - A function to receive the frames of audio features
 * @property {string} [windowingFunction] - The Windowing Function to apply to the signal before transformation to the frequency domain
 * @property {string|Array.<string>} [featureExtractors] - Specify the feature extractors you want to run on the audio.
 * @property {boolean} [startImmediately] - Pass `true` to start feature extraction immediately
 * @property {number} [numberOfMFCCCoefficients] - The number of MFCC co-efficients that the MFCC feature extractor should return
 */

/**
 * Web Audio context
 * Either an {@link AudioContext|https://developer.mozilla.org/en-US/docs/Web/API/AudioContext}
 * or an {@link OfflineAudioContext|https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext}
 * @typedef {Object} AudioContext
 */

/**
 * AudioNode
 * A Web AudioNode
 * @typedef {Object} AudioNode
 */

/**
 * ScriptProcessorNode
 * A Web Audio ScriptProcessorNode
 * @typedef {Object} ScriptProcessorNode
 */

/**
 * @class Meyda
 * @hideconstructor
 * @classdesc
 * The schema for the default export of the Meyda library.
 * @example
 * var Meyda = require('meyda');
 */

var Meyda = {
  /**
   * Meyda stores a reference to the relevant audio context here for use inside
   * the Web Audio API.
   * @instance
   * @member {AudioContext}
   */
  audioContext: null,

  /**
   * Meyda keeps an internal ScriptProcessorNode in which it runs audio feature
   * extraction. The ScriptProcessorNode is stored in this member variable.
   * @instance
   * @member {ScriptProcessorNode}
   */
  spn: null,

  /**
   * The length of each buffer that Meyda will extract audio on. When recieving
   * input via the Web Audio API, the Script Processor Node chunks incoming audio
   * into arrays of this length. Longer buffers allow for more precision in the
   * frequency domain, but increase the amount of time it takes for Meyda to
   * output a set of audio features for the buffer. You can calculate how many
   * sets of audio features Meyda will output per second by dividing the
   * buffer size by the sample rate. If you're using Meyda for visualisation,
   * make sure that you're collecting audio features at a rate that's faster
   * than or equal to the video frame rate you expect.
   * @instance
   * @member {number}
   */
  bufferSize: 512,

  /**
   * The number of samples per second of the incoming audio. This affects
   * feature extraction outside of the context of the Web Audio API, and must be
   * set accurately - otherwise calculations will be off.
   * @instance
   * @member {number}
   */
  sampleRate: 44100,

  /**
   * The number of Mel bands to use in the Mel Frequency Cepstral Co-efficients
   * feature extractor
   * @instance
   * @member {number}
   */
  melBands: 26,

  /**
   * The number of bands to divide the spectrum into for the Chroma feature
   * extractor. 12 is the standard number of semitones per octave in the western
   * music tradition, but Meyda can use an arbitrary number of bands, which
   * can be useful for microtonal music.
   * @instance
   * @member {number}
   */
  chromaBands: 12,

  /**
   * A function you can provide that will be called for each buffer that Meyda
   * receives from its source node
   * @instance
   * @member {Function}
   */
  callback: null,

  /**
   * Specify the windowing function to apply to the buffer before the
   * transformation from the time domain to the frequency domain is performed
   *
   * The default windowing function is the hanning window.
   *
   * @instance
   * @member {string}
   */
  windowingFunction: 'hanning',

  /**
   * @member {object}
   */
  featureExtractors: _featureExtractors__WEBPACK_IMPORTED_MODULE_1__,
  EXTRACTION_STARTED: false,

  /**
   * The number of MFCC co-efficients that the MFCC feature extractor should return
   * @instance
   * @member {number}
   */
  numberOfMFCCCoefficients: 13,
  _featuresToExtract: [],
  windowing: _utilities__WEBPACK_IMPORTED_MODULE_0__["applyWindow"],
  _errors: {
    notPow2: new Error('Meyda: Buffer size must be a power of 2, e.g. 64 or 512'),
    featureUndef: new Error('Meyda: No features defined.'),
    invalidFeatureFmt: new Error('Meyda: Invalid feature format'),
    invalidInput: new Error('Meyda: Invalid input.'),
    noAC: new Error('Meyda: No AudioContext specified.'),
    noSource: new Error('Meyda: No source node specified.')
  },

  /**
   * @summary
   * Create a MeydaAnalyzer
   *
   * A factory function for creating a MeydaAnalyzer, the interface for using
   * Meyda in the context of Web Audio.
   *
   * @method
   * @param {MeydaOptions} options Options - an object containing configuration
   * @returns {MeydaAnalyzer}
   * @example
   * const analyzer = Meyda.createMeydaAnalyzer({
   *   "audioContext": audioContext,
   *   "source": source,
   *   "bufferSize": 512,
   *   "featureExtractors": ["rms"],
   *   "inputs": 2,
   *   "callback": features => {
   *     levelRangeElement.value = features.rms;
   *   }
   * });
   */
  createMeydaAnalyzer: function createMeydaAnalyzer(options) {
    return new _meyda_wa__WEBPACK_IMPORTED_MODULE_3__["MeydaAnalyzer"](options, Object.assign({}, Meyda));
  },

  /**
   * Extract an audio feature from a buffer
   *
   * Unless `meyda.windowingFunction` is set otherwise, `extract` will
   * internally apply a hanning window to the buffer prior to conversion into
   * the frequency domain.
   *
   * @function
   * @param {(string|Array.<string>)} feature - the feature you want to extract
   * @param {Array.<number>} signal
   * An array of numbers that represents the signal. It should be of length
   * `meyda.bufferSize`
   * @param {Array.<number>} [previousSignal] - the previous buffer
   * @returns {object} Features
   * @example
   * meyda.bufferSize = 2048;
   * const features = meyda.extract(['zcr', 'spectralCentroid'], signal);
   */
  extract: function extract(feature, signal, previousSignal) {
    var _this = this;

    if (!signal) throw this._errors.invalidInput;else if (_typeof(signal) != 'object') throw this._errors.invalidInput;else if (!feature) throw this._errors.featureUndef;else if (!_utilities__WEBPACK_IMPORTED_MODULE_0__["isPowerOfTwo"](signal.length)) throw this._errors.notPow2;

    if (typeof this.barkScale == 'undefined' || this.barkScale.length != this.bufferSize) {
      this.barkScale = _utilities__WEBPACK_IMPORTED_MODULE_0__["createBarkScale"](this.bufferSize, this.sampleRate, this.bufferSize);
    } // Recalculate mel bank if buffer length changed


    if (typeof this.melFilterBank == 'undefined' || this.barkScale.length != this.bufferSize || this.melFilterBank.length != this.melBands) {
      this.melFilterBank = _utilities__WEBPACK_IMPORTED_MODULE_0__["createMelFilterBank"](Math.max(this.melBands, this.numberOfMFCCCoefficients), this.sampleRate, this.bufferSize);
    } // Recalculate chroma bank if buffer length changed


    if (typeof this.chromaFilterBank == 'undefined' || this.chromaFilterBank.length != this.chromaBands) {
      this.chromaFilterBank = _utilities__WEBPACK_IMPORTED_MODULE_0__["createChromaFilterBank"](this.chromaBands, this.sampleRate, this.bufferSize);
    }

    if (typeof signal.buffer == 'undefined') {
      //signal is a normal array, convert to F32A
      this.signal = _utilities__WEBPACK_IMPORTED_MODULE_0__["arrayToTyped"](signal);
    } else {
      this.signal = signal;
    }

    var preparedSignal = prepareSignalWithSpectrum(signal, this.windowingFunction, this.bufferSize);
    this.signal = preparedSignal.windowedSignal;
    this.complexSpectrum = preparedSignal.complexSpectrum;
    this.ampSpectrum = preparedSignal.ampSpectrum;

    if (previousSignal) {
      var _preparedSignal = prepareSignalWithSpectrum(previousSignal, this.windowingFunction, this.bufferSize);

      this.previousSignal = _preparedSignal.windowedSignal;
      this.previousComplexSpectrum = _preparedSignal.complexSpectrum;
      this.previousAmpSpectrum = _preparedSignal.ampSpectrum;
    }

    var extract = function extract(feature) {
      return _this.featureExtractors[feature]({
        ampSpectrum: _this.ampSpectrum,
        chromaFilterBank: _this.chromaFilterBank,
        complexSpectrum: _this.complexSpectrum,
        signal: _this.signal,
        bufferSize: _this.bufferSize,
        sampleRate: _this.sampleRate,
        barkScale: _this.barkScale,
        melFilterBank: _this.melFilterBank,
        previousSignal: _this.previousSignal,
        previousAmpSpectrum: _this.previousAmpSpectrum,
        previousComplexSpectrum: _this.previousComplexSpectrum,
        numberOfMFCCCoefficients: _this.numberOfMFCCCoefficients
      });
    };

    if (_typeof(feature) === 'object') {
      return feature.reduce(function (acc, el) {
        return Object.assign({}, acc, _defineProperty({}, el, extract(el)));
      }, {});
    } else if (typeof feature === 'string') {
      return extract(feature);
    } else {
      throw this._errors.invalidFeatureFmt;
    }
  }
};

var prepareSignalWithSpectrum = function prepareSignalWithSpectrum(signal, windowingFunction, bufferSize) {
  var preparedSignal = {};

  if (typeof signal.buffer == 'undefined') {
    //signal is a normal array, convert to F32A
    preparedSignal.signal = _utilities__WEBPACK_IMPORTED_MODULE_0__["arrayToTyped"](signal);
  } else {
    preparedSignal.signal = signal;
  }

  preparedSignal.windowedSignal = _utilities__WEBPACK_IMPORTED_MODULE_0__["applyWindow"](preparedSignal.signal, windowingFunction);
  preparedSignal.complexSpectrum = Object(fftjs__WEBPACK_IMPORTED_MODULE_2__["fft"])(preparedSignal.windowedSignal);
  preparedSignal.ampSpectrum = new Float32Array(bufferSize / 2);

  for (var i = 0; i < bufferSize / 2; i++) {
    preparedSignal.ampSpectrum[i] = Math.sqrt(Math.pow(preparedSignal.complexSpectrum.real[i], 2) + Math.pow(preparedSignal.complexSpectrum.imag[i], 2));
  }

  return preparedSignal;
};
/**
 * The Meyda class
 * @type {Meyda}
 */


/* harmony default export */ __webpack_exports__["default"] = (Meyda);
if (typeof window !== 'undefined') window.Meyda = Meyda;

/***/ }),

/***/ "./src/meyda-wa.js":
/*!*************************!*\
  !*** ./src/meyda-wa.js ***!
  \*************************/
/*! exports provided: MeydaAnalyzer */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "MeydaAnalyzer", function() { return MeydaAnalyzer; });
/* harmony import */ var _utilities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utilities */ "./src/utilities.js");
/* harmony import */ var _featureExtractors__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./featureExtractors */ "./src/featureExtractors.js");
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }



/**
  * MeydaAnalyzer
  * @classdesc
  * Meyda's interface to the Web Audio API. MeydaAnalyzer abstracts an API on
  * top of the Web Audio API's ScriptProcessorNode, running the Meyda audio
  * feature extractors inside that context.
  *
  * MeydaAnalyzer's constructor should not be called directly - MeydaAnalyzer
  * objects should be generated using the {@link Meyda.createMeydaAnalyzer}
  * factory function in the main Meyda class.
  *
  * @example
  * const analyzer = Meyda.createMeydaAnalyzer({
  *   "audioContext": audioContext,
  *   "source": source,
  *   "bufferSize": 512,
  *   "featureExtractors": ["rms"],
  *   "inputs": 2,
  *   "numberOfMFCCCoefficients": 20
  *   "callback": features => {
  *     levelRangeElement.value = features.rms;
  *   }
  * });
  * @hideconstructor
  */

var MeydaAnalyzer =
/*#__PURE__*/
function () {
  function MeydaAnalyzer(options, _this) {
    var _this2 = this;

    _classCallCheck(this, MeydaAnalyzer);

    this._m = _this;

    if (!options.audioContext) {
      throw this._m.errors.noAC;
    } else if (options.bufferSize && !_utilities__WEBPACK_IMPORTED_MODULE_0__["isPowerOfTwo"](options.bufferSize)) {
      throw this._m._errors.notPow2;
    } else if (!options.source) {
      throw this._m._errors.noSource;
    }

    this._m.audioContext = options.audioContext; // TODO: validate options

    this._m.bufferSize = options.bufferSize || this._m.bufferSize || 256;
    this._m.hopSize = options.hopSize || this._m.hopSize || this._m.bufferSize;
    this._m.sampleRate = options.sampleRate || this._m.audioContext.sampleRate || 44100;
    this._m.callback = options.callback;
    this._m.windowingFunction = options.windowingFunction || 'hanning';
    this._m.featureExtractors = _featureExtractors__WEBPACK_IMPORTED_MODULE_1__;
    this._m.EXTRACTION_STARTED = options.startImmediately || false;
    this._m.channel = typeof options.channel === 'number' ? options.channel : 0;
    this._m.inputs = options.inputs || 1;
    this._m.outputs = options.outputs || 1;
    this._m.numberOfMFCCCoefficients = options.numberOfMFCCCoefficients || this._m.numberOfMFCCCoefficients || 13; //create nodes

    this._m.spn = this._m.audioContext.createScriptProcessor(this._m.bufferSize, this._m.inputs, this._m.outputs);

    this._m.spn.connect(this._m.audioContext.destination);

    this._m._featuresToExtract = options.featureExtractors || []; //always recalculate BS and MFB when a new Meyda analyzer is created.

    this._m.barkScale = _utilities__WEBPACK_IMPORTED_MODULE_0__["createBarkScale"](this._m.bufferSize, this._m.sampleRate, this._m.bufferSize);
    this._m.melFilterBank = _utilities__WEBPACK_IMPORTED_MODULE_0__["createMelFilterBank"](Math.max(this._m.melBands, this._m.numberOfMFCCCoefficients), this._m.sampleRate, this._m.bufferSize);
    this._m.inputData = null;
    this._m.previousInputData = null;
    this._m.frame = null;
    this._m.previousFrame = null;
    this.setSource(options.source);

    this._m.spn.onaudioprocess = function (e) {
      if (_this2._m.inputData !== null) {
        _this2._m.previousInputData = _this2._m.inputData;
      }

      _this2._m.inputData = e.inputBuffer.getChannelData(_this2._m.channel);

      if (!_this2._m.previousInputData) {
        var buffer = _this2._m.inputData;
      } else {
        var buffer = new Float32Array(_this2._m.previousInputData.length + _this2._m.inputData.length - _this2._m.hopSize);
        buffer.set(_this2._m.previousInputData.slice(_this2._m.hopSize));
        buffer.set(_this2._m.inputData, _this2._m.previousInputData.length - _this2._m.hopSize);
      }

      ;
      var frames = _utilities__WEBPACK_IMPORTED_MODULE_0__["frame"](buffer, _this2._m.bufferSize, _this2._m.hopSize);
      frames.forEach(function (f) {
        _this2._m.frame = f;

        var features = _this2._m.extract(_this2._m._featuresToExtract, _this2._m.frame, _this2._m.previousFrame); // call callback if applicable


        if (typeof _this2._m.callback === 'function' && _this2._m.EXTRACTION_STARTED) {
          _this2._m.callback(features);
        }

        _this2._m.previousFrame = _this2._m.frame;
      });
    };
  }
  /**
   * Start feature extraction
   * The audio features will be passed to the callback function that was defined
   * in the MeydaOptions that were passed to the factory when constructing the
   * MeydaAnalyzer.
   * @param {(string|Array.<string>)} [features]
   * Change the features that Meyda is extracting. Defaults to the features that
   * were set upon construction in the options parameter.
   * @example
   * analyzer.start('chroma');
   */


  _createClass(MeydaAnalyzer, [{
    key: "start",
    value: function start(features) {
      this._m._featuresToExtract = features || this._m._featuresToExtract;
      this._m.EXTRACTION_STARTED = true;
    }
    /**
     * Stop feature extraction.
     * @example
     * analyzer.stop();
     */

  }, {
    key: "stop",
    value: function stop() {
      this._m.EXTRACTION_STARTED = false;
    }
    /**
     * Set the Audio Node for Meyda to listen to.
     * @param {AudioNode} source - The Audio Node for Meyda to listen to
     * @example
     * analyzer.setSource(audioSourceNode);
     */

  }, {
    key: "setSource",
    value: function setSource(source) {
      this._m.source && this._m.source.disconnect(this._m.spn);
      this._m.source = source;

      this._m.source.connect(this._m.spn);
    }
    /**
     * Set the channel of the audio node for Meyda to listen to
     * @param {number} channel - the index of the channel on the input audio node
     * for Meyda to listen to.
     * @example
     * analyzer.setChannel(0);
     */

  }, {
    key: "setChannel",
    value: function setChannel(channel) {
      if (channel <= this._m.inputs) {
        this._m.channel = channel;
      } else {
        console.error("Channel ".concat(channel, " does not exist. Make sure you've provided a value for 'inputs' that is greater than ").concat(channel, " when instantiating the MeydaAnalyzer"));
      }
    }
    /**
     * Get a set of features from the current frame.
     * @param {(string|Array.<string>)} [features]
     * Change the features that Meyda is extracting
     * @example
     * analyzer.get('spectralFlatness');
     */

  }, {
    key: "get",
    value: function get(features) {
      if (this._m.inputData) {
        return this._m.extract(features || this._m._featuresToExtract, this._m.inputData, this._m.previousInputData);
      } else {
        return null;
      }
    }
  }]);

  return MeydaAnalyzer;
}();

/***/ }),

/***/ "./src/utilities.js":
/*!**************************!*\
  !*** ./src/utilities.js ***!
  \**************************/
/*! exports provided: isPowerOfTwo, error, pointwiseBufferMult, applyWindow, createBarkScale, typedToArray, arrayToTyped, _normalize, normalize, normalizeToOne, mean, melToFreq, freqToMel, createMelFilterBank, hzToOctaves, normalizeByColumn, createChromaFilterBank, frame */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "isPowerOfTwo", function() { return isPowerOfTwo; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "error", function() { return error; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "pointwiseBufferMult", function() { return pointwiseBufferMult; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "applyWindow", function() { return applyWindow; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createBarkScale", function() { return createBarkScale; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "typedToArray", function() { return typedToArray; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "arrayToTyped", function() { return arrayToTyped; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "_normalize", function() { return _normalize; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "normalize", function() { return normalize; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "normalizeToOne", function() { return normalizeToOne; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "mean", function() { return mean; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "melToFreq", function() { return melToFreq; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "freqToMel", function() { return freqToMel; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createMelFilterBank", function() { return createMelFilterBank; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "hzToOctaves", function() { return hzToOctaves; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "normalizeByColumn", function() { return normalizeByColumn; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "createChromaFilterBank", function() { return createChromaFilterBank; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "frame", function() { return frame; });
/* harmony import */ var _windowing__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./windowing */ "./src/windowing.js");
function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }


var windows = {};
function isPowerOfTwo(num) {
  while (num % 2 === 0 && num > 1) {
    num /= 2;
  }

  return num === 1;
}
function error(message) {
  throw new Error('Meyda: ' + message);
}
function pointwiseBufferMult(a, b) {
  var c = [];

  for (var i = 0; i < Math.min(a.length, b.length); i++) {
    c[i] = a[i] * b[i];
  }

  return c;
}
function applyWindow(signal, windowname) {
  if (windowname !== 'rect') {
    if (windowname === '' || !windowname) windowname = 'hanning';
    if (!windows[windowname]) windows[windowname] = {};

    if (!windows[windowname][signal.length]) {
      try {
        windows[windowname][signal.length] = _windowing__WEBPACK_IMPORTED_MODULE_0__[windowname](signal.length);
      } catch (e) {
        throw new Error('Invalid windowing function');
      }
    }

    signal = pointwiseBufferMult(signal, windows[windowname][signal.length]);
  }

  return signal;
}
function createBarkScale(length, sampleRate, bufferSize) {
  var barkScale = new Float32Array(length);

  for (var i = 0; i < barkScale.length; i++) {
    barkScale[i] = i * sampleRate / bufferSize;
    barkScale[i] = 13 * Math.atan(barkScale[i] / 1315.8) + 3.5 * Math.atan(Math.pow(barkScale[i] / 7518, 2));
  }

  return barkScale;
}
function typedToArray(t) {
  // utility to convert typed arrays to normal arrays
  return Array.prototype.slice.call(t);
}
function arrayToTyped(t) {
  // utility to convert arrays to typed F32 arrays
  return Float32Array.from(t);
}
function _normalize(num, range) {
  return num / range;
}
function normalize(a, range) {
  return a.map(function (n) {
    return _normalize(n, range);
  });
}
function normalizeToOne(a) {
  var max = Math.max.apply(null, a);
  return a.map(function (n) {
    return n / max;
  });
}
function mean(a) {
  return a.reduce(function (prev, cur) {
    return prev + cur;
  }) / a.length;
}

function _melToFreq(melValue) {
  var freqValue = 700 * (Math.exp(melValue / 1125) - 1);
  return freqValue;
}

function _freqToMel(freqValue) {
  var melValue = 1125 * Math.log(1 + freqValue / 700);
  return melValue;
}

function melToFreq(mV) {
  return _melToFreq(mV);
}
function freqToMel(fV) {
  return _freqToMel(fV);
}
function createMelFilterBank(numFilters, sampleRate, bufferSize) {
  //the +2 is the upper and lower limits
  var melValues = new Float32Array(numFilters + 2);
  var melValuesInFreq = new Float32Array(numFilters + 2); //Generate limits in Hz - from 0 to the nyquist.

  var lowerLimitFreq = 0;
  var upperLimitFreq = sampleRate / 2; //Convert the limits to Mel

  var lowerLimitMel = _freqToMel(lowerLimitFreq);

  var upperLimitMel = _freqToMel(upperLimitFreq); //Find the range


  var range = upperLimitMel - lowerLimitMel; //Find the range as part of the linear interpolation

  var valueToAdd = range / (numFilters + 1);
  var fftBinsOfFreq = Array(numFilters + 2);

  for (var i = 0; i < melValues.length; i++) {
    // Initialising the mel frequencies
    // They're a linear interpolation between the lower and upper limits.
    melValues[i] = i * valueToAdd; // Convert back to Hz

    melValuesInFreq[i] = _melToFreq(melValues[i]); // Find the corresponding bins

    fftBinsOfFreq[i] = Math.floor((bufferSize + 1) * melValuesInFreq[i] / sampleRate);
  }

  var filterBank = Array(numFilters);

  for (var j = 0; j < filterBank.length; j++) {
    // Create a two dimensional array of size numFilters * (buffersize/2)+1
    // pre-populating the arrays with 0s.
    filterBank[j] = Array.apply(null, new Array(bufferSize / 2 + 1)).map(Number.prototype.valueOf, 0); //creating the lower and upper slopes for each bin

    for (var _i = fftBinsOfFreq[j]; _i < fftBinsOfFreq[j + 1]; _i++) {
      filterBank[j][_i] = (_i - fftBinsOfFreq[j]) / (fftBinsOfFreq[j + 1] - fftBinsOfFreq[j]);
    }

    for (var _i2 = fftBinsOfFreq[j + 1]; _i2 < fftBinsOfFreq[j + 2]; _i2++) {
      filterBank[j][_i2] = (fftBinsOfFreq[j + 2] - _i2) / (fftBinsOfFreq[j + 2] - fftBinsOfFreq[j + 1]);
    }
  }

  return filterBank;
}
function hzToOctaves(freq, A440) {
  return Math.log2(16 * freq / A440);
}
function normalizeByColumn(a) {
  var emptyRow = a[0].map(function () {
    return 0;
  });
  var colDenominators = a.reduce(function (acc, row) {
    row.forEach(function (cell, j) {
      acc[j] += Math.pow(cell, 2);
    });
    return acc;
  }, emptyRow).map(Math.sqrt);
  return a.map(function (row, i) {
    return row.map(function (v, j) {
      return v / (colDenominators[j] || 1);
    });
  });
}
;
function createChromaFilterBank(numFilters, sampleRate, bufferSize) {
  var centerOctave = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 5;
  var octaveWidth = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 2;
  var baseC = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : true;
  var A440 = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 440;
  var numOutputBins = Math.floor(bufferSize / 2) + 1;
  var frequencyBins = new Array(bufferSize).fill(0).map(function (_, i) {
    return numFilters * hzToOctaves(sampleRate * i / bufferSize, A440);
  }); // Set a value for the 0 Hz bin that is 1.5 octaves below bin 1
  // (so chroma is 50% rotated from bin 1, and bin width is broad)

  frequencyBins[0] = frequencyBins[1] - 1.5 * numFilters;
  var binWidthBins = frequencyBins.slice(1).map(function (v, i) {
    return Math.max(v - frequencyBins[i]);
  }, 1).concat([1]);
  var halfNumFilters = Math.round(numFilters / 2);
  var filterPeaks = new Array(numFilters).fill(0).map(function (_, i) {
    return frequencyBins.map(function (frq) {
      return (10 * numFilters + halfNumFilters + frq - i) % numFilters - halfNumFilters;
    });
  });
  var weights = filterPeaks.map(function (row, i) {
    return row.map(function (_, j) {
      return Math.exp(-0.5 * Math.pow(2 * filterPeaks[i][j] / binWidthBins[j], 2));
    });
  });
  weights = normalizeByColumn(weights);

  if (octaveWidth) {
    var octaveWeights = frequencyBins.map(function (v) {
      return Math.exp(-0.5 * Math.pow((v / numFilters - centerOctave) / octaveWidth, 2));
    });
    weights = weights.map(function (row) {
      return row.map(function (cell, j) {
        return cell * octaveWeights[j];
      });
    });
  }

  if (baseC) {
    weights = [].concat(_toConsumableArray(weights.slice(3)), _toConsumableArray(weights.slice(0, 3)));
  }

  return weights.map(function (row) {
    return row.slice(0, numOutputBins);
  });
}
function frame(buffer, frameLength, hopLength) {
  if (buffer.length < frameLength) {
    throw new Error('Buffer is too short for frame length');
  }

  if (hopLength < 1) {
    throw new Error('Hop length cannot be less that 1');
  }

  if (frameLength < 1) {
    throw new Error('Frame length cannot be less that 1');
  }

  var numFrames = 1 + Math.floor((buffer.length - frameLength) / hopLength);
  return new Array(numFrames).fill(0).map(function (_, i) {
    return buffer.slice(i * hopLength, i * hopLength + frameLength);
  });
}

/***/ }),

/***/ "./src/windowing.js":
/*!**************************!*\
  !*** ./src/windowing.js ***!
  \**************************/
/*! exports provided: blackman, sine, hanning, hamming */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "blackman", function() { return blackman; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "sine", function() { return sine; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "hanning", function() { return hanning; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "hamming", function() { return hamming; });
function blackman(size) {
  var blackmanBuffer = new Float32Array(size);
  var coeff1 = 2 * Math.PI / (size - 1);
  var coeff2 = 2 * coeff1; //According to http://uk.mathworks.com/help/signal/ref/blackman.html
  //first half of the window

  for (var i = 0; i < size / 2; i++) {
    blackmanBuffer[i] = 0.42 - 0.5 * Math.cos(i * coeff1) + 0.08 * Math.cos(i * coeff2);
  } //second half of the window


  for (var _i = size / 2; _i > 0; _i--) {
    blackmanBuffer[size - _i] = blackmanBuffer[_i - 1];
  }

  return blackmanBuffer;
}
function sine(size) {
  var coeff = Math.PI / (size - 1);
  var sineBuffer = new Float32Array(size);

  for (var i = 0; i < size; i++) {
    sineBuffer[i] = Math.sin(coeff * i);
  }

  return sineBuffer;
}
function hanning(size) {
  var hanningBuffer = new Float32Array(size);

  for (var i = 0; i < size; i++) {
    // According to the R documentation
    // http://ugrad.stat.ubc.ca/R/library/e1071/html/hanning.window.html
    hanningBuffer[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
  }

  return hanningBuffer;
}
function hamming(size) {
  var hammingBuffer = new Float32Array(size);

  for (var i = 0; i < size; i++) {
    //According to http://uk.mathworks.com/help/signal/ref/hamming.html
    hammingBuffer[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * (i / size - 1));
  }

  return hammingBuffer;
}

/***/ })

/******/ });
});

},{}],19:[function(require,module,exports){
'use strict'

module.exports = mouseListen

var mouse = require('mouse-event')

function mouseListen (element, callback) {
  if (!callback) {
    callback = element
    element = window
  }

  var buttonState = 0
  var x = 0
  var y = 0
  var mods = {
    shift: false,
    alt: false,
    control: false,
    meta: false
  }
  var attached = false

  function updateMods (ev) {
    var changed = false
    if ('altKey' in ev) {
      changed = changed || ev.altKey !== mods.alt
      mods.alt = !!ev.altKey
    }
    if ('shiftKey' in ev) {
      changed = changed || ev.shiftKey !== mods.shift
      mods.shift = !!ev.shiftKey
    }
    if ('ctrlKey' in ev) {
      changed = changed || ev.ctrlKey !== mods.control
      mods.control = !!ev.ctrlKey
    }
    if ('metaKey' in ev) {
      changed = changed || ev.metaKey !== mods.meta
      mods.meta = !!ev.metaKey
    }
    return changed
  }

  function handleEvent (nextButtons, ev) {
    var nextX = mouse.x(ev)
    var nextY = mouse.y(ev)
    if ('buttons' in ev) {
      nextButtons = ev.buttons | 0
    }
    if (nextButtons !== buttonState ||
      nextX !== x ||
      nextY !== y ||
      updateMods(ev)) {
      buttonState = nextButtons | 0
      x = nextX || 0
      y = nextY || 0
      callback && callback(buttonState, x, y, mods)
    }
  }

  function clearState (ev) {
    handleEvent(0, ev)
  }

  function handleBlur () {
    if (buttonState ||
      x ||
      y ||
      mods.shift ||
      mods.alt ||
      mods.meta ||
      mods.control) {
      x = y = 0
      buttonState = 0
      mods.shift = mods.alt = mods.control = mods.meta = false
      callback && callback(0, 0, 0, mods)
    }
  }

  function handleMods (ev) {
    if (updateMods(ev)) {
      callback && callback(buttonState, x, y, mods)
    }
  }

  function handleMouseMove (ev) {
    if (mouse.buttons(ev) === 0) {
      handleEvent(0, ev)
    } else {
      handleEvent(buttonState, ev)
    }
  }

  function handleMouseDown (ev) {
    handleEvent(buttonState | mouse.buttons(ev), ev)
  }

  function handleMouseUp (ev) {
    handleEvent(buttonState & ~mouse.buttons(ev), ev)
  }

  function attachListeners () {
    if (attached) {
      return
    }
    attached = true

    element.addEventListener('mousemove', handleMouseMove)

    element.addEventListener('mousedown', handleMouseDown)

    element.addEventListener('mouseup', handleMouseUp)

    element.addEventListener('mouseleave', clearState)
    element.addEventListener('mouseenter', clearState)
    element.addEventListener('mouseout', clearState)
    element.addEventListener('mouseover', clearState)

    element.addEventListener('blur', handleBlur)

    element.addEventListener('keyup', handleMods)
    element.addEventListener('keydown', handleMods)
    element.addEventListener('keypress', handleMods)

    if (element !== window) {
      window.addEventListener('blur', handleBlur)

      window.addEventListener('keyup', handleMods)
      window.addEventListener('keydown', handleMods)
      window.addEventListener('keypress', handleMods)
    }
  }

  function detachListeners () {
    if (!attached) {
      return
    }
    attached = false

    element.removeEventListener('mousemove', handleMouseMove)

    element.removeEventListener('mousedown', handleMouseDown)

    element.removeEventListener('mouseup', handleMouseUp)

    element.removeEventListener('mouseleave', clearState)
    element.removeEventListener('mouseenter', clearState)
    element.removeEventListener('mouseout', clearState)
    element.removeEventListener('mouseover', clearState)

    element.removeEventListener('blur', handleBlur)

    element.removeEventListener('keyup', handleMods)
    element.removeEventListener('keydown', handleMods)
    element.removeEventListener('keypress', handleMods)

    if (element !== window) {
      window.removeEventListener('blur', handleBlur)

      window.removeEventListener('keyup', handleMods)
      window.removeEventListener('keydown', handleMods)
      window.removeEventListener('keypress', handleMods)
    }
  }

  // Attach listeners
  attachListeners()

  var result = {
    element: element
  }

  Object.defineProperties(result, {
    enabled: {
      get: function () { return attached },
      set: function (f) {
        if (f) {
          attachListeners()
        } else {
          detachListeners()
        }
      },
      enumerable: true
    },
    buttons: {
      get: function () { return buttonState },
      enumerable: true
    },
    x: {
      get: function () { return x },
      enumerable: true
    },
    y: {
      get: function () { return y },
      enumerable: true
    },
    mods: {
      get: function () { return mods },
      enumerable: true
    }
  })

  return result
}

},{"mouse-event":20}],20:[function(require,module,exports){
'use strict'

function mouseButtons(ev) {
  if(typeof ev === 'object') {
    if('buttons' in ev) {
      return ev.buttons
    } else if('which' in ev) {
      var b = ev.which
      if(b === 2) {
        return 4
      } else if(b === 3) {
        return 2
      } else if(b > 0) {
        return 1<<(b-1)
      }
    } else if('button' in ev) {
      var b = ev.button
      if(b === 1) {
        return 4
      } else if(b === 2) {
        return 2
      } else if(b >= 0) {
        return 1<<b
      }
    }
  }
  return 0
}
exports.buttons = mouseButtons

function mouseElement(ev) {
  return ev.target || ev.srcElement || window
}
exports.element = mouseElement

function mouseRelativeX(ev) {
  if(typeof ev === 'object') {
    if('offsetX' in ev) {
      return ev.offsetX
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientX - bounds.left
  }
  return 0
}
exports.x = mouseRelativeX

function mouseRelativeY(ev) {
  if(typeof ev === 'object') {
    if('offsetY' in ev) {
      return ev.offsetY
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientY - bounds.top
  }
  return 0
}
exports.y = mouseRelativeY

},{}],21:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.12.2
(function() {
  var getNanoSeconds, hrtime, loadTime, moduleLoadTime, nodeLoadTime, upTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - nodeLoadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    moduleLoadTime = getNanoSeconds();
    upTime = process.uptime() * 1e9;
    nodeLoadTime = moduleLoadTime - upTime;
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);



}).call(this,require('_process'))
},{"_process":27}],22:[function(require,module,exports){
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var now = require('right-now')
var raf = require('raf')

module.exports = Engine
function Engine(fn) {
    if (!(this instanceof Engine)) 
        return new Engine(fn)
    this.running = false
    this.last = now()
    this._frame = 0
    this._tick = this.tick.bind(this)

    if (fn)
        this.on('tick', fn)
}

inherits(Engine, EventEmitter)

Engine.prototype.start = function() {
    if (this.running) 
        return
    this.running = true
    this.last = now()
    this._frame = raf(this._tick)
    return this
}

Engine.prototype.stop = function() {
    this.running = false
    if (this._frame !== 0)
        raf.cancel(this._frame)
    this._frame = 0
    return this
}

Engine.prototype.tick = function() {
    this._frame = raf(this._tick)
    var time = now()
    var dt = time - this.last
    this.emit('tick', dt)
    this.last = time
}
},{"events":26,"inherits":17,"raf":23,"right-now":25}],23:[function(require,module,exports){
(function (global){
var now = require('performance-now')
  , root = typeof window === 'undefined' ? global : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = root['request' + suffix]
  , caf = root['cancel' + suffix] || root['cancelRequest' + suffix]

for(var i = 0; !raf && i < vendors.length; i++) {
  raf = root[vendors[i] + 'Request' + suffix]
  caf = root[vendors[i] + 'Cancel' + suffix]
      || root[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  return raf.call(root, fn)
}
module.exports.cancel = function() {
  caf.apply(root, arguments)
}
module.exports.polyfill = function(object) {
  if (!object) {
    object = root;
  }
  object.requestAnimationFrame = raf
  object.cancelAnimationFrame = caf
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"performance-now":21}],24:[function(require,module,exports){
(function(ja,N){"object"===typeof exports&&"undefined"!==typeof module?module.exports=N():"function"===typeof define&&define.amd?define(N):ja.createREGL=N()})(this,function(){function ja(a,b){this.id=Bb++;this.type=a;this.data=b}function N(a){if(0===a.length)return[];var b=a.charAt(0),c=a.charAt(a.length-1);if(1<a.length&&b===c&&('"'===b||"'"===b))return['"'+a.substr(1,a.length-2).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];if(b=/\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(a))return N(a.substr(0,
b.index)).concat(N(b[1])).concat(N(a.substr(b.index+b[0].length)));b=a.split(".");if(1===b.length)return['"'+a.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];a=[];for(c=0;c<b.length;++c)a=a.concat(N(b[c]));return a}function bb(a){return"["+N(a).join("][")+"]"}function Cb(){var a={"":0},b=[""];return{id:function(c){var e=a[c];if(e)return e;e=a[c]=b.length;b.push(c);return e},str:function(a){return b[a]}}}function Db(a,b,c){function e(){var b=window.innerWidth,e=window.innerHeight;a!==document.body&&
(e=a.getBoundingClientRect(),b=e.right-e.left,e=e.bottom-e.top);g.width=c*b;g.height=c*e;H(g.style,{width:b+"px",height:e+"px"})}var g=document.createElement("canvas");H(g.style,{border:0,margin:0,padding:0,top:0,left:0});a.appendChild(g);a===document.body&&(g.style.position="absolute",H(a.style,{margin:0,padding:0}));var d;a!==document.body&&"function"===typeof ResizeObserver?(d=new ResizeObserver(function(){setTimeout(e)}),d.observe(a)):window.addEventListener("resize",e,!1);e();return{canvas:g,
onDestroy:function(){d?d.disconnect():window.removeEventListener("resize",e);a.removeChild(g)}}}function Eb(a,b){function c(c){try{return a.getContext(c,b)}catch(g){return null}}return c("webgl")||c("experimental-webgl")||c("webgl-experimental")}function cb(a){return"string"===typeof a?a.split():a}function db(a){return"string"===typeof a?document.querySelector(a):a}function Fb(a){var b=a||{},c,e,g,d;a={};var r=[],n=[],u="undefined"===typeof window?1:window.devicePixelRatio,q=!1,t=function(a){},m=
function(){};"string"===typeof b?c=document.querySelector(b):"object"===typeof b&&("string"===typeof b.nodeName&&"function"===typeof b.appendChild&&"function"===typeof b.getBoundingClientRect?c=b:"function"===typeof b.drawArrays||"function"===typeof b.drawElements?(d=b,g=d.canvas):("gl"in b?d=b.gl:"canvas"in b?g=db(b.canvas):"container"in b&&(e=db(b.container)),"attributes"in b&&(a=b.attributes),"extensions"in b&&(r=cb(b.extensions)),"optionalExtensions"in b&&(n=cb(b.optionalExtensions)),"onDone"in
b&&(t=b.onDone),"profile"in b&&(q=!!b.profile),"pixelRatio"in b&&(u=+b.pixelRatio)));c&&("canvas"===c.nodeName.toLowerCase()?g=c:e=c);if(!d){if(!g){c=Db(e||document.body,t,u);if(!c)return null;g=c.canvas;m=c.onDestroy}void 0===a.premultipliedAlpha&&(a.premultipliedAlpha=!0);d=Eb(g,a)}return d?{gl:d,canvas:g,container:e,extensions:r,optionalExtensions:n,pixelRatio:u,profile:q,onDone:t,onDestroy:m}:(m(),t("webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org"),null)}
function Gb(a,b){function c(b){b=b.toLowerCase();var c;try{c=e[b]=a.getExtension(b)}catch(g){}return!!c}for(var e={},g=0;g<b.extensions.length;++g){var d=b.extensions[g];if(!c(d))return b.onDestroy(),b.onDone('"'+d+'" extension is not supported by the current WebGL context, try upgrading your system or a different browser'),null}b.optionalExtensions.forEach(c);return{extensions:e,restore:function(){Object.keys(e).forEach(function(a){if(e[a]&&!c(a))throw Error("(regl): error restoring extension "+
a);})}}}function A(a,b){for(var c=Array(a),e=0;e<a;++e)c[e]=b(e);return c}function eb(a){var b,c;b=(65535<a)<<4;a>>>=b;c=(255<a)<<3;a>>>=c;b|=c;c=(15<a)<<2;a>>>=c;b|=c;c=(3<a)<<1;return b|c|a>>>c>>1}function fb(){function a(a){a:{for(var b=16;268435456>=b;b*=16)if(a<=b){a=b;break a}a=0}b=c[eb(a)>>2];return 0<b.length?b.pop():new ArrayBuffer(a)}function b(a){c[eb(a.byteLength)>>2].push(a)}var c=A(8,function(){return[]});return{alloc:a,free:b,allocType:function(b,c){var d=null;switch(b){case 5120:d=
new Int8Array(a(c),0,c);break;case 5121:d=new Uint8Array(a(c),0,c);break;case 5122:d=new Int16Array(a(2*c),0,c);break;case 5123:d=new Uint16Array(a(2*c),0,c);break;case 5124:d=new Int32Array(a(4*c),0,c);break;case 5125:d=new Uint32Array(a(4*c),0,c);break;case 5126:d=new Float32Array(a(4*c),0,c);break;default:return null}return d.length!==c?d.subarray(0,c):d},freeType:function(a){b(a.buffer)}}}function X(a){return!!a&&"object"===typeof a&&Array.isArray(a.shape)&&Array.isArray(a.stride)&&"number"===
typeof a.offset&&a.shape.length===a.stride.length&&(Array.isArray(a.data)||G(a.data))}function gb(a,b,c,e,g,d){for(var r=0;r<b;++r)for(var n=a[r],u=0;u<c;++u)for(var q=n[u],t=0;t<e;++t)g[d++]=q[t]}function hb(a,b,c,e,g){for(var d=1,r=c+1;r<b.length;++r)d*=b[r];var n=b[c];if(4===b.length-c){var u=b[c+1],q=b[c+2];b=b[c+3];for(r=0;r<n;++r)gb(a[r],u,q,b,e,g),g+=d}else for(r=0;r<n;++r)hb(a[r],b,c+1,e,g),g+=d}function Fa(a){return Ga[Object.prototype.toString.call(a)]|0}function ib(a,b){for(var c=0;c<b.length;++c)a[c]=
b[c]}function jb(a,b,c,e,g,d,r){for(var n=0,u=0;u<c;++u)for(var q=0;q<e;++q)a[n++]=b[g*u+d*q+r]}function Hb(a,b,c,e){function g(b){this.id=u++;this.buffer=a.createBuffer();this.type=b;this.usage=35044;this.byteLength=0;this.dimension=1;this.dtype=5121;this.persistentData=null;c.profile&&(this.stats={size:0})}function d(b,c,k){b.byteLength=c.byteLength;a.bufferData(b.type,c,k)}function r(a,b,c,h,f,p){a.usage=c;if(Array.isArray(b)){if(a.dtype=h||5126,0<b.length)if(Array.isArray(b[0])){f=kb(b);for(var l=
h=1;l<f.length;++l)h*=f[l];a.dimension=h;b=Qa(b,f,a.dtype);d(a,b,c);p?a.persistentData=b:z.freeType(b)}else"number"===typeof b[0]?(a.dimension=f,f=z.allocType(a.dtype,b.length),ib(f,b),d(a,f,c),p?a.persistentData=f:z.freeType(f)):G(b[0])&&(a.dimension=b[0].length,a.dtype=h||Fa(b[0])||5126,b=Qa(b,[b.length,b[0].length],a.dtype),d(a,b,c),p?a.persistentData=b:z.freeType(b))}else if(G(b))a.dtype=h||Fa(b),a.dimension=f,d(a,b,c),p&&(a.persistentData=new Uint8Array(new Uint8Array(b.buffer)));else if(X(b)){f=
b.shape;var v=b.stride,l=b.offset,e=0,g=0,q=0,n=0;1===f.length?(e=f[0],g=1,q=v[0],n=0):2===f.length&&(e=f[0],g=f[1],q=v[0],n=v[1]);a.dtype=h||Fa(b.data)||5126;a.dimension=g;f=z.allocType(a.dtype,e*g);jb(f,b.data,e,g,q,n,l);d(a,f,c);p?a.persistentData=f:z.freeType(f)}else b instanceof ArrayBuffer&&(a.dtype=5121,a.dimension=f,d(a,b,c),p&&(a.persistentData=new Uint8Array(new Uint8Array(b))))}function n(c){b.bufferCount--;e(c);a.deleteBuffer(c.buffer);c.buffer=null;delete q[c.id]}var u=0,q={};g.prototype.bind=
function(){a.bindBuffer(this.type,this.buffer)};g.prototype.destroy=function(){n(this)};var t=[];c.profile&&(b.getTotalBufferSize=function(){var a=0;Object.keys(q).forEach(function(b){a+=q[b].stats.size});return a});return{create:function(m,e,d,h){function f(b){var m=35044,e=null,d=0,g=0,k=1;Array.isArray(b)||G(b)||X(b)||b instanceof ArrayBuffer?e=b:"number"===typeof b?d=b|0:b&&("data"in b&&(e=b.data),"usage"in b&&(m=lb[b.usage]),"type"in b&&(g=Ha[b.type]),"dimension"in b&&(k=b.dimension|0),"length"in
b&&(d=b.length|0));p.bind();e?r(p,e,m,g,k,h):(d&&a.bufferData(p.type,d,m),p.dtype=g||5121,p.usage=m,p.dimension=k,p.byteLength=d);c.profile&&(p.stats.size=p.byteLength*ha[p.dtype]);return f}b.bufferCount++;var p=new g(e);q[p.id]=p;d||f(m);f._reglType="buffer";f._buffer=p;f.subdata=function(b,c){var m=(c||0)|0,h;p.bind();if(G(b)||b instanceof ArrayBuffer)a.bufferSubData(p.type,m,b);else if(Array.isArray(b)){if(0<b.length)if("number"===typeof b[0]){var d=z.allocType(p.dtype,b.length);ib(d,b);a.bufferSubData(p.type,
m,d);z.freeType(d)}else if(Array.isArray(b[0])||G(b[0]))h=kb(b),d=Qa(b,h,p.dtype),a.bufferSubData(p.type,m,d),z.freeType(d)}else if(X(b)){h=b.shape;var e=b.stride,g=d=0,k=0,q=0;1===h.length?(d=h[0],g=1,k=e[0],q=0):2===h.length&&(d=h[0],g=h[1],k=e[0],q=e[1]);h=Array.isArray(b.data)?p.dtype:Fa(b.data);h=z.allocType(h,d*g);jb(h,b.data,d,g,k,q,b.offset);a.bufferSubData(p.type,m,h);z.freeType(h)}return f};c.profile&&(f.stats=p.stats);f.destroy=function(){n(p)};return f},createStream:function(a,b){var c=
t.pop();c||(c=new g(a));c.bind();r(c,b,35040,0,1,!1);return c},destroyStream:function(a){t.push(a)},clear:function(){J(q).forEach(n);t.forEach(n)},getBuffer:function(a){return a&&a._buffer instanceof g?a._buffer:null},restore:function(){J(q).forEach(function(b){b.buffer=a.createBuffer();a.bindBuffer(b.type,b.buffer);a.bufferData(b.type,b.persistentData||b.byteLength,b.usage)})},_initBuffer:r}}function Ib(a,b,c,e){function g(a){this.id=u++;n[this.id]=this;this.buffer=a;this.primType=4;this.type=this.vertCount=
0}function d(d,e,g,h,f,p,l){d.buffer.bind();var v;e?((v=l)||G(e)&&(!X(e)||G(e.data))||(v=b.oes_element_index_uint?5125:5123),c._initBuffer(d.buffer,e,g,v,3)):(a.bufferData(34963,p,g),d.buffer.dtype=v||5121,d.buffer.usage=g,d.buffer.dimension=3,d.buffer.byteLength=p);v=l;if(!l){switch(d.buffer.dtype){case 5121:case 5120:v=5121;break;case 5123:case 5122:v=5123;break;case 5125:case 5124:v=5125}d.buffer.dtype=v}d.type=v;e=f;0>e&&(e=d.buffer.byteLength,5123===v?e>>=1:5125===v&&(e>>=2));d.vertCount=e;e=
h;0>h&&(e=4,h=d.buffer.dimension,1===h&&(e=0),2===h&&(e=1),3===h&&(e=4));d.primType=e}function r(a){e.elementsCount--;delete n[a.id];a.buffer.destroy();a.buffer=null}var n={},u=0,q={uint8:5121,uint16:5123};b.oes_element_index_uint&&(q.uint32=5125);g.prototype.bind=function(){this.buffer.bind()};var t=[];return{create:function(a,b){function k(a){if(a)if("number"===typeof a)h(a),f.primType=4,f.vertCount=a|0,f.type=5121;else{var b=null,c=35044,e=-1,g=-1,m=0,n=0;if(Array.isArray(a)||G(a)||X(a))b=a;else if("data"in
a&&(b=a.data),"usage"in a&&(c=lb[a.usage]),"primitive"in a&&(e=Sa[a.primitive]),"count"in a&&(g=a.count|0),"type"in a&&(n=q[a.type]),"length"in a)m=a.length|0;else if(m=g,5123===n||5122===n)m*=2;else if(5125===n||5124===n)m*=4;d(f,b,c,e,g,m,n)}else h(),f.primType=4,f.vertCount=0,f.type=5121;return k}var h=c.create(null,34963,!0),f=new g(h._buffer);e.elementsCount++;k(a);k._reglType="elements";k._elements=f;k.subdata=function(a,b){h.subdata(a,b);return k};k.destroy=function(){r(f)};return k},createStream:function(a){var b=
t.pop();b||(b=new g(c.create(null,34963,!0,!1)._buffer));d(b,a,35040,-1,-1,0,0);return b},destroyStream:function(a){t.push(a)},getElements:function(a){return"function"===typeof a&&a._elements instanceof g?a._elements:null},clear:function(){J(n).forEach(r)}}}function nb(a){for(var b=z.allocType(5123,a.length),c=0;c<a.length;++c)if(isNaN(a[c]))b[c]=65535;else if(Infinity===a[c])b[c]=31744;else if(-Infinity===a[c])b[c]=64512;else{ob[0]=a[c];var e=Jb[0],g=e>>>31<<15,d=(e<<1>>>24)-127,e=e>>13&1023;b[c]=
-24>d?g:-14>d?g+(e+1024>>-14-d):15<d?g+31744:g+(d+15<<10)+e}return b}function na(a){return Array.isArray(a)||G(a)}function ka(a){return"[object "+a+"]"}function pb(a){return Array.isArray(a)&&(0===a.length||"number"===typeof a[0])}function qb(a){return Array.isArray(a)&&0!==a.length&&na(a[0])?!0:!1}function Y(a){return Object.prototype.toString.call(a)}function Ta(a){if(!a)return!1;var b=Y(a);return 0<=Kb.indexOf(b)?!0:pb(a)||qb(a)||X(a)}function rb(a,b){36193===a.type?(a.data=nb(b),z.freeType(b)):
a.data=b}function Ia(a,b,c,e,g,d){a="undefined"!==typeof w[a]?w[a]:S[a]*Z[b];d&&(a*=6);if(g){for(e=0;1<=c;)e+=a*c*c,c/=2;return e}return a*c*e}function Lb(a,b,c,e,g,d,r){function n(){this.format=this.internalformat=6408;this.type=5121;this.flipY=this.premultiplyAlpha=this.compressed=!1;this.unpackAlignment=1;this.colorSpace=37444;this.channels=this.height=this.width=0}function u(a,b){a.internalformat=b.internalformat;a.format=b.format;a.type=b.type;a.compressed=b.compressed;a.premultiplyAlpha=b.premultiplyAlpha;
a.flipY=b.flipY;a.unpackAlignment=b.unpackAlignment;a.colorSpace=b.colorSpace;a.width=b.width;a.height=b.height;a.channels=b.channels}function q(a,b){if("object"===typeof b&&b){"premultiplyAlpha"in b&&(a.premultiplyAlpha=b.premultiplyAlpha);"flipY"in b&&(a.flipY=b.flipY);"alignment"in b&&(a.unpackAlignment=b.alignment);"colorSpace"in b&&(a.colorSpace=Mb[b.colorSpace]);"type"in b&&(a.type=K[b.type]);var c=a.width,f=a.height,e=a.channels,d=!1;"shape"in b?(c=b.shape[0],f=b.shape[1],3===b.shape.length&&
(e=b.shape[2],d=!0)):("radius"in b&&(c=f=b.radius),"width"in b&&(c=b.width),"height"in b&&(f=b.height),"channels"in b&&(e=b.channels,d=!0));a.width=c|0;a.height=f|0;a.channels=e|0;c=!1;"format"in b&&(c=b.format,f=a.internalformat=B[c],a.format=M[f],c in K&&!("type"in b)&&(a.type=K[c]),c in V&&(a.compressed=!0),c=!0);!d&&c?a.channels=S[a.format]:d&&!c&&a.channels!==La[a.format]&&(a.format=a.internalformat=La[a.channels])}}function t(b){a.pixelStorei(37440,b.flipY);a.pixelStorei(37441,b.premultiplyAlpha);
a.pixelStorei(37443,b.colorSpace);a.pixelStorei(3317,b.unpackAlignment)}function m(){n.call(this);this.yOffset=this.xOffset=0;this.data=null;this.needsFree=!1;this.element=null;this.needsCopy=!1}function F(a,b){var c=null;Ta(b)?c=b:b&&(q(a,b),"x"in b&&(a.xOffset=b.x|0),"y"in b&&(a.yOffset=b.y|0),Ta(b.data)&&(c=b.data));if(b.copy){var f=g.viewportWidth,d=g.viewportHeight;a.width=a.width||f-a.xOffset;a.height=a.height||d-a.yOffset;a.needsCopy=!0}else if(!c)a.width=a.width||1,a.height=a.height||1,a.channels=
a.channels||4;else if(G(c))a.channels=a.channels||4,a.data=c,"type"in b||5121!==a.type||(a.type=Ga[Object.prototype.toString.call(c)]|0);else if(pb(c)){a.channels=a.channels||4;f=c;d=f.length;switch(a.type){case 5121:case 5123:case 5125:case 5126:d=z.allocType(a.type,d);d.set(f);a.data=d;break;case 36193:a.data=nb(f)}a.alignment=1;a.needsFree=!0}else if(X(c)){f=c.data;Array.isArray(f)||5121!==a.type||(a.type=Ga[Object.prototype.toString.call(f)]|0);var d=c.shape,e=c.stride,h,l,k,p;3===d.length?(k=
d[2],p=e[2]):p=k=1;h=d[0];l=d[1];d=e[0];e=e[1];a.alignment=1;a.width=h;a.height=l;a.channels=k;a.format=a.internalformat=La[k];a.needsFree=!0;h=p;c=c.offset;k=a.width;p=a.height;l=a.channels;for(var y=z.allocType(36193===a.type?5126:a.type,k*p*l),I=0,U=0;U<p;++U)for(var da=0;da<k;++da)for(var Ua=0;Ua<l;++Ua)y[I++]=f[d*da+e*U+h*Ua+c];rb(a,y)}else if(Y(c)===Va||Y(c)===Wa||Y(c)===sb)Y(c)===Va||Y(c)===Wa?a.element=c:a.element=c.canvas,a.width=a.element.width,a.height=a.element.height,a.channels=4;else if(Y(c)===
tb)a.element=c,a.width=c.width,a.height=c.height,a.channels=4;else if(Y(c)===ub)a.element=c,a.width=c.naturalWidth,a.height=c.naturalHeight,a.channels=4;else if(Y(c)===vb)a.element=c,a.width=c.videoWidth,a.height=c.videoHeight,a.channels=4;else if(qb(c)){f=a.width||c[0].length;d=a.height||c.length;e=a.channels;e=na(c[0][0])?e||c[0][0].length:e||1;h=Ma.shape(c);k=1;for(p=0;p<h.length;++p)k*=h[p];k=z.allocType(36193===a.type?5126:a.type,k);Ma.flatten(c,h,"",k);rb(a,k);a.alignment=1;a.width=f;a.height=
d;a.channels=e;a.format=a.internalformat=La[e];a.needsFree=!0}}function k(b,c,f,d,h){var g=b.element,k=b.data,l=b.internalformat,p=b.format,v=b.type,y=b.width,I=b.height;t(b);g?a.texSubImage2D(c,h,f,d,p,v,g):b.compressed?a.compressedTexSubImage2D(c,h,f,d,l,y,I,k):b.needsCopy?(e(),a.copyTexSubImage2D(c,h,f,d,b.xOffset,b.yOffset,y,I)):a.texSubImage2D(c,h,f,d,y,I,p,v,k)}function h(){return L.pop()||new m}function f(a){a.needsFree&&z.freeType(a.data);m.call(a);L.push(a)}function p(){n.call(this);this.genMipmaps=
!1;this.mipmapHint=4352;this.mipmask=0;this.images=Array(16)}function l(a,b,c){var f=a.images[0]=h();a.mipmask=1;f.width=a.width=b;f.height=a.height=c;f.channels=a.channels=4}function v(a,b){var c=null;if(Ta(b))c=a.images[0]=h(),u(c,a),F(c,b),a.mipmask=1;else if(q(a,b),Array.isArray(b.mipmap))for(var f=b.mipmap,d=0;d<f.length;++d)c=a.images[d]=h(),u(c,a),c.width>>=d,c.height>>=d,F(c,f[d]),a.mipmask|=1<<d;else c=a.images[0]=h(),u(c,a),F(c,b),a.mipmask=1;u(a,a.images[0])}function Q(b,c){for(var f=b.images,
d=0;d<f.length&&f[d];++d){var h=f[d],g=c,k=d,l=h.element,p=h.data,v=h.internalformat,y=h.format,I=h.type,U=h.width,da=h.height;t(h);l?a.texImage2D(g,k,y,y,I,l):h.compressed?a.compressedTexImage2D(g,k,v,U,da,0,p):h.needsCopy?(e(),a.copyTexImage2D(g,k,y,h.xOffset,h.yOffset,U,da,0)):a.texImage2D(g,k,y,U,da,0,y,I,p||null)}}function C(){var a=A.pop()||new p;n.call(a);for(var b=a.mipmask=0;16>b;++b)a.images[b]=null;return a}function va(a){for(var b=a.images,c=0;c<b.length;++c)b[c]&&f(b[c]),b[c]=null;A.push(a)}
function ea(){this.magFilter=this.minFilter=9728;this.wrapT=this.wrapS=33071;this.anisotropic=1;this.genMipmaps=!1;this.mipmapHint=4352}function mb(a,b){"min"in b&&(a.minFilter=O[b.min],0<=Nb.indexOf(a.minFilter)&&!("faces"in b)&&(a.genMipmaps=!0));"mag"in b&&(a.magFilter=T[b.mag]);var c=a.wrapS,f=a.wrapT;if("wrap"in b){var d=b.wrap;"string"===typeof d?c=f=la[d]:Array.isArray(d)&&(c=la[d[0]],f=la[d[1]])}else"wrapS"in b&&(c=la[b.wrapS]),"wrapT"in b&&(f=la[b.wrapT]);a.wrapS=c;a.wrapT=f;"anisotropic"in
b&&(a.anisotropic=b.anisotropic);if("mipmap"in b){c=!1;switch(typeof b.mipmap){case "string":a.mipmapHint=x[b.mipmap];c=a.genMipmaps=!0;break;case "boolean":c=a.genMipmaps=b.mipmap;break;case "object":a.genMipmaps=!1,c=!0}!c||"min"in b||(a.minFilter=9984)}}function Ra(c,f){a.texParameteri(f,10241,c.minFilter);a.texParameteri(f,10240,c.magFilter);a.texParameteri(f,10242,c.wrapS);a.texParameteri(f,10243,c.wrapT);b.ext_texture_filter_anisotropic&&a.texParameteri(f,34046,c.anisotropic);c.genMipmaps&&
(a.hint(33170,c.mipmapHint),a.generateMipmap(f))}function R(b){n.call(this);this.mipmask=0;this.internalformat=6408;this.id=P++;this.refCount=1;this.target=b;this.texture=a.createTexture();this.unit=-1;this.bindCount=0;this.texInfo=new ea;r.profile&&(this.stats={size:0})}function sa(b){a.activeTexture(33984);a.bindTexture(b.target,b.texture)}function za(){var b=W[0];b?a.bindTexture(b.target,b.texture):a.bindTexture(3553,null)}function D(b){var c=b.texture,f=b.unit,h=b.target;0<=f&&(a.activeTexture(33984+
f),a.bindTexture(h,null),W[f]=null);a.deleteTexture(c);b.texture=null;b.params=null;b.pixels=null;b.refCount=0;delete E[b.id];d.textureCount--}var x={"don't care":4352,"dont care":4352,nice:4354,fast:4353},la={repeat:10497,clamp:33071,mirror:33648},T={nearest:9728,linear:9729},O=H({mipmap:9987,"nearest mipmap nearest":9984,"linear mipmap nearest":9985,"nearest mipmap linear":9986,"linear mipmap linear":9987},T),Mb={none:0,browser:37444},K={uint8:5121,rgba4:32819,rgb565:33635,"rgb5 a1":32820},B={alpha:6406,
luminance:6409,"luminance alpha":6410,rgb:6407,rgba:6408,rgba4:32854,"rgb5 a1":32855,rgb565:36194},V={};b.ext_srgb&&(B.srgb=35904,B.srgba=35906);b.oes_texture_float&&(K.float32=K["float"]=5126);b.oes_texture_half_float&&(K.float16=K["half float"]=36193);b.webgl_depth_texture&&(H(B,{depth:6402,"depth stencil":34041}),H(K,{uint16:5123,uint32:5125,"depth stencil":34042}));b.webgl_compressed_texture_s3tc&&H(V,{"rgb s3tc dxt1":33776,"rgba s3tc dxt1":33777,"rgba s3tc dxt3":33778,"rgba s3tc dxt5":33779});
b.webgl_compressed_texture_atc&&H(V,{"rgb atc":35986,"rgba atc explicit alpha":35987,"rgba atc interpolated alpha":34798});b.webgl_compressed_texture_pvrtc&&H(V,{"rgb pvrtc 4bppv1":35840,"rgb pvrtc 2bppv1":35841,"rgba pvrtc 4bppv1":35842,"rgba pvrtc 2bppv1":35843});b.webgl_compressed_texture_etc1&&(V["rgb etc1"]=36196);var w=Array.prototype.slice.call(a.getParameter(34467));Object.keys(V).forEach(function(a){var b=V[a];0<=w.indexOf(b)&&(B[a]=b)});var wa=Object.keys(B);c.textureFormats=wa;var aa=[];
Object.keys(B).forEach(function(a){aa[B[a]]=a});var xa=[];Object.keys(K).forEach(function(a){xa[K[a]]=a});var ba=[];Object.keys(T).forEach(function(a){ba[T[a]]=a});var Da=[];Object.keys(O).forEach(function(a){Da[O[a]]=a});var fa=[];Object.keys(la).forEach(function(a){fa[la[a]]=a});var M=wa.reduce(function(a,c){var f=B[c];6409===f||6406===f||6409===f||6410===f||6402===f||34041===f||b.ext_srgb&&(35904===f||35906===f)?a[f]=f:32855===f||0<=c.indexOf("rgba")?a[f]=6408:a[f]=6407;return a},{}),L=[],A=[],
P=0,E={},ia=c.maxTextureUnits,W=Array(ia).map(function(){return null});H(R.prototype,{bind:function(){this.bindCount+=1;var b=this.unit;if(0>b){for(var c=0;c<ia;++c){var f=W[c];if(f){if(0<f.bindCount)continue;f.unit=-1}W[c]=this;b=c;break}r.profile&&d.maxTextureUnits<b+1&&(d.maxTextureUnits=b+1);this.unit=b;a.activeTexture(33984+b);a.bindTexture(this.target,this.texture)}return b},unbind:function(){--this.bindCount},decRef:function(){0>=--this.refCount&&D(this)}});r.profile&&(d.getTotalTextureSize=
function(){var a=0;Object.keys(E).forEach(function(b){a+=E[b].stats.size});return a});return{create2D:function(b,c){function e(a,b){var c=g.texInfo;ea.call(c);var f=C();"number"===typeof a?"number"===typeof b?l(f,a|0,b|0):l(f,a|0,a|0):a?(mb(c,a),v(f,a)):l(f,1,1);c.genMipmaps&&(f.mipmask=(f.width<<1)-1);g.mipmask=f.mipmask;u(g,f);g.internalformat=f.internalformat;e.width=f.width;e.height=f.height;sa(g);Q(f,3553);Ra(c,3553);za();va(f);r.profile&&(g.stats.size=Ia(g.internalformat,g.type,f.width,f.height,
c.genMipmaps,!1));e.format=aa[g.internalformat];e.type=xa[g.type];e.mag=ba[c.magFilter];e.min=Da[c.minFilter];e.wrapS=fa[c.wrapS];e.wrapT=fa[c.wrapT];return e}var g=new R(3553);E[g.id]=g;d.textureCount++;e(b,c);e.subimage=function(a,b,c,d){b|=0;c|=0;d|=0;var l=h();u(l,g);l.width=0;l.height=0;F(l,a);l.width=l.width||(g.width>>d)-b;l.height=l.height||(g.height>>d)-c;sa(g);k(l,3553,b,c,d);za();f(l);return e};e.resize=function(b,c){var f=b|0,d=c|0||f;if(f===g.width&&d===g.height)return e;e.width=g.width=
f;e.height=g.height=d;sa(g);for(var h=0;g.mipmask>>h;++h){var l=f>>h,y=d>>h;if(!l||!y)break;a.texImage2D(3553,h,g.format,l,y,0,g.format,g.type,null)}za();r.profile&&(g.stats.size=Ia(g.internalformat,g.type,f,d,!1,!1));return e};e._reglType="texture2d";e._texture=g;r.profile&&(e.stats=g.stats);e.destroy=function(){g.decRef()};return e},createCube:function(b,c,e,g,p,n){function m(a,b,c,f,d,e){var h,ma=x.texInfo;ea.call(ma);for(h=0;6>h;++h)D[h]=C();if("number"===typeof a||!a)for(a=a|0||1,h=0;6>h;++h)l(D[h],
a,a);else if("object"===typeof a)if(b)v(D[0],a),v(D[1],b),v(D[2],c),v(D[3],f),v(D[4],d),v(D[5],e);else if(mb(ma,a),q(x,a),"faces"in a)for(a=a.faces,h=0;6>h;++h)u(D[h],x),v(D[h],a[h]);else for(h=0;6>h;++h)v(D[h],a);u(x,D[0]);x.mipmask=ma.genMipmaps?(D[0].width<<1)-1:D[0].mipmask;x.internalformat=D[0].internalformat;m.width=D[0].width;m.height=D[0].height;sa(x);for(h=0;6>h;++h)Q(D[h],34069+h);Ra(ma,34067);za();r.profile&&(x.stats.size=Ia(x.internalformat,x.type,m.width,m.height,ma.genMipmaps,!0));m.format=
aa[x.internalformat];m.type=xa[x.type];m.mag=ba[ma.magFilter];m.min=Da[ma.minFilter];m.wrapS=fa[ma.wrapS];m.wrapT=fa[ma.wrapT];for(h=0;6>h;++h)va(D[h]);return m}var x=new R(34067);E[x.id]=x;d.cubeCount++;var D=Array(6);m(b,c,e,g,p,n);m.subimage=function(a,b,c,d,e){c|=0;d|=0;e|=0;var g=h();u(g,x);g.width=0;g.height=0;F(g,b);g.width=g.width||(x.width>>e)-c;g.height=g.height||(x.height>>e)-d;sa(x);k(g,34069+a,c,d,e);za();f(g);return m};m.resize=function(b){b|=0;if(b!==x.width){m.width=x.width=b;m.height=
x.height=b;sa(x);for(var c=0;6>c;++c)for(var f=0;x.mipmask>>f;++f)a.texImage2D(34069+c,f,x.format,b>>f,b>>f,0,x.format,x.type,null);za();r.profile&&(x.stats.size=Ia(x.internalformat,x.type,m.width,m.height,!1,!0));return m}};m._reglType="textureCube";m._texture=x;r.profile&&(m.stats=x.stats);m.destroy=function(){x.decRef()};return m},clear:function(){for(var b=0;b<ia;++b)a.activeTexture(33984+b),a.bindTexture(3553,null),W[b]=null;J(E).forEach(D);d.cubeCount=0;d.textureCount=0},getTexture:function(a){return null},
restore:function(){for(var b=0;b<ia;++b){var c=W[b];c&&(c.bindCount=0,c.unit=-1,W[b]=null)}J(E).forEach(function(b){b.texture=a.createTexture();a.bindTexture(b.target,b.texture);for(var c=0;32>c;++c)if(0!==(b.mipmask&1<<c))if(3553===b.target)a.texImage2D(3553,c,b.internalformat,b.width>>c,b.height>>c,0,b.internalformat,b.type,null);else for(var f=0;6>f;++f)a.texImage2D(34069+f,c,b.internalformat,b.width>>c,b.height>>c,0,b.internalformat,b.type,null);Ra(b.texInfo,b.target)})}}}function Ob(a,b,c,e,
g,d){function r(a,b,c){this.target=a;this.texture=b;this.renderbuffer=c;var f=a=0;b?(a=b.width,f=b.height):c&&(a=c.width,f=c.height);this.width=a;this.height=f}function n(a){a&&(a.texture&&a.texture._texture.decRef(),a.renderbuffer&&a.renderbuffer._renderbuffer.decRef())}function u(a,b,c){a&&(a.texture?a.texture._texture.refCount+=1:a.renderbuffer._renderbuffer.refCount+=1)}function q(b,c){c&&(c.texture?a.framebufferTexture2D(36160,b,c.target,c.texture._texture.texture,0):a.framebufferRenderbuffer(36160,
b,36161,c.renderbuffer._renderbuffer.renderbuffer))}function t(a){var b=3553,c=null,f=null,d=a;"object"===typeof a&&(d=a.data,"target"in a&&(b=a.target|0));a=d._reglType;"texture2d"===a?c=d:"textureCube"===a?c=d:"renderbuffer"===a&&(f=d,b=36161);return new r(b,c,f)}function m(a,b,c,f,d){if(c)return a=e.create2D({width:a,height:b,format:f,type:d}),a._texture.refCount=0,new r(3553,a,null);a=g.create({width:a,height:b,format:f});a._renderbuffer.refCount=0;return new r(36161,null,a)}function F(a){return a&&
(a.texture||a.renderbuffer)}function k(a,b,c){a&&(a.texture?a.texture.resize(b,c):a.renderbuffer&&a.renderbuffer.resize(b,c),a.width=b,a.height=c)}function h(){this.id=z++;w[this.id]=this;this.framebuffer=a.createFramebuffer();this.height=this.width=0;this.colorAttachments=[];this.depthStencilAttachment=this.stencilAttachment=this.depthAttachment=null}function f(a){a.colorAttachments.forEach(n);n(a.depthAttachment);n(a.stencilAttachment);n(a.depthStencilAttachment)}function p(b){a.deleteFramebuffer(b.framebuffer);
b.framebuffer=null;d.framebufferCount--;delete w[b.id]}function l(b){var f;a.bindFramebuffer(36160,b.framebuffer);var d=b.colorAttachments;for(f=0;f<d.length;++f)q(36064+f,d[f]);for(f=d.length;f<c.maxColorAttachments;++f)a.framebufferTexture2D(36160,36064+f,3553,null,0);a.framebufferTexture2D(36160,33306,3553,null,0);a.framebufferTexture2D(36160,36096,3553,null,0);a.framebufferTexture2D(36160,36128,3553,null,0);q(36096,b.depthAttachment);q(36128,b.stencilAttachment);q(33306,b.depthStencilAttachment);
a.checkFramebufferStatus(36160);a.isContextLost();a.bindFramebuffer(36160,Q.next?Q.next.framebuffer:null);Q.cur=Q.next;a.getError()}function v(a,b){function c(a,b){var d,h=0,g=0,k=!0,p=!0;d=null;var v=!0,n="rgba",q="uint8",r=1,ea=null,ba=null,Q=null,fa=!1;if("number"===typeof a)h=a|0,g=b|0||h;else if(a){"shape"in a?(g=a.shape,h=g[0],g=g[1]):("radius"in a&&(h=g=a.radius),"width"in a&&(h=a.width),"height"in a&&(g=a.height));if("color"in a||"colors"in a)d=a.color||a.colors,Array.isArray(d);if(!d){"colorCount"in
a&&(r=a.colorCount|0);"colorTexture"in a&&(v=!!a.colorTexture,n="rgba4");if("colorType"in a&&(q=a.colorType,!v))if("half float"===q||"float16"===q)n="rgba16f";else if("float"===q||"float32"===q)n="rgba32f";"colorFormat"in a&&(n=a.colorFormat,0<=C.indexOf(n)?v=!0:0<=va.indexOf(n)&&(v=!1))}if("depthTexture"in a||"depthStencilTexture"in a)fa=!(!a.depthTexture&&!a.depthStencilTexture);"depth"in a&&("boolean"===typeof a.depth?k=a.depth:(ea=a.depth,p=!1));"stencil"in a&&("boolean"===typeof a.stencil?p=
a.stencil:(ba=a.stencil,k=!1));"depthStencil"in a&&("boolean"===typeof a.depthStencil?k=p=a.depthStencil:(Q=a.depthStencil,p=k=!1))}else h=g=1;var M=null,z=null,w=null,R=null;if(Array.isArray(d))M=d.map(t);else if(d)M=[t(d)];else for(M=Array(r),d=0;d<r;++d)M[d]=m(h,g,v,n,q);h=h||M[0].width;g=g||M[0].height;ea?z=t(ea):k&&!p&&(z=m(h,g,fa,"depth","uint32"));ba?w=t(ba):p&&!k&&(w=m(h,g,!1,"stencil","uint8"));Q?R=t(Q):!ea&&!ba&&p&&k&&(R=m(h,g,fa,"depth stencil","depth stencil"));k=null;for(d=0;d<M.length;++d)u(M[d],
h,g),M[d]&&M[d].texture&&(p=Xa[M[d].texture._texture.format]*Na[M[d].texture._texture.type],null===k&&(k=p));u(z,h,g);u(w,h,g);u(R,h,g);f(e);e.width=h;e.height=g;e.colorAttachments=M;e.depthAttachment=z;e.stencilAttachment=w;e.depthStencilAttachment=R;c.color=M.map(F);c.depth=F(z);c.stencil=F(w);c.depthStencil=F(R);c.width=e.width;c.height=e.height;l(e);return c}var e=new h;d.framebufferCount++;c(a,b);return H(c,{resize:function(a,b){var f=Math.max(a|0,1),d=Math.max(b|0||f,1);if(f===e.width&&d===
e.height)return c;for(var h=e.colorAttachments,g=0;g<h.length;++g)k(h[g],f,d);k(e.depthAttachment,f,d);k(e.stencilAttachment,f,d);k(e.depthStencilAttachment,f,d);e.width=c.width=f;e.height=c.height=d;l(e);return c},_reglType:"framebuffer",_framebuffer:e,destroy:function(){p(e);f(e)},use:function(a){Q.setFBO({framebuffer:c},a)}})}var Q={cur:null,next:null,dirty:!1,setFBO:null},C=["rgba"],va=["rgba4","rgb565","rgb5 a1"];b.ext_srgb&&va.push("srgba");b.ext_color_buffer_half_float&&va.push("rgba16f","rgb16f");
b.webgl_color_buffer_float&&va.push("rgba32f");var ea=["uint8"];b.oes_texture_half_float&&ea.push("half float","float16");b.oes_texture_float&&ea.push("float","float32");var z=0,w={};return H(Q,{getFramebuffer:function(a){return"function"===typeof a&&"framebuffer"===a._reglType&&(a=a._framebuffer,a instanceof h)?a:null},create:v,createCube:function(a){function b(a){var f,d={color:null},h=0,g=null;f="rgba";var k="uint8",l=1;if("number"===typeof a)h=a|0;else if(a){"shape"in a?h=a.shape[0]:("radius"in
a&&(h=a.radius|0),"width"in a?h=a.width|0:"height"in a&&(h=a.height|0));if("color"in a||"colors"in a)g=a.color||a.colors,Array.isArray(g);g||("colorCount"in a&&(l=a.colorCount|0),"colorType"in a&&(k=a.colorType),"colorFormat"in a&&(f=a.colorFormat));"depth"in a&&(d.depth=a.depth);"stencil"in a&&(d.stencil=a.stencil);"depthStencil"in a&&(d.depthStencil=a.depthStencil)}else h=1;if(g)if(Array.isArray(g))for(a=[],f=0;f<g.length;++f)a[f]=g[f];else a=[g];else for(a=Array(l),g={radius:h,format:f,type:k},
f=0;f<l;++f)a[f]=e.createCube(g);d.color=Array(a.length);for(f=0;f<a.length;++f)l=a[f],h=h||l.width,d.color[f]={target:34069,data:a[f]};for(f=0;6>f;++f){for(l=0;l<a.length;++l)d.color[l].target=34069+f;0<f&&(d.depth=c[0].depth,d.stencil=c[0].stencil,d.depthStencil=c[0].depthStencil);if(c[f])c[f](d);else c[f]=v(d)}return H(b,{width:h,height:h,color:a})}var c=Array(6);b(a);return H(b,{faces:c,resize:function(a){var f=a|0;if(f===b.width)return b;var d=b.color;for(a=0;a<d.length;++a)d[a].resize(f);for(a=
0;6>a;++a)c[a].resize(f);b.width=b.height=f;return b},_reglType:"framebufferCube",destroy:function(){c.forEach(function(a){a.destroy()})}})},clear:function(){J(w).forEach(p)},restore:function(){Q.cur=null;Q.next=null;Q.dirty=!0;J(w).forEach(function(b){b.framebuffer=a.createFramebuffer();l(b)})}})}function Ya(){this.w=this.z=this.y=this.x=this.state=0;this.buffer=null;this.size=0;this.normalized=!1;this.type=5126;this.divisor=this.stride=this.offset=0}function Pb(a,b,c,e,g){function d(a){if(a!==h.currentVAO){var c=
b.oes_vertex_array_object;a?c.bindVertexArrayOES(a.vao):c.bindVertexArrayOES(null);h.currentVAO=a}}function r(c){if(c!==h.currentVAO){if(c)c.bindAttrs();else for(var d=b.angle_instanced_arrays,e=0;e<m.length;++e){var g=m[e];g.buffer?(a.enableVertexAttribArray(e),a.vertexAttribPointer(e,g.size,g.type,g.normalized,g.stride,g.offfset),d&&d.vertexAttribDivisorANGLE(e,g.divisor)):(a.disableVertexAttribArray(e),a.vertexAttrib4f(e,g.x,g.y,g.z,g.w))}h.currentVAO=c}}function n(){J(k).forEach(function(a){a.destroy()})}
function u(){this.id=++F;this.attributes=[];var a=b.oes_vertex_array_object;this.vao=a?a.createVertexArrayOES():null;k[this.id]=this;this.buffers=[]}function q(){b.oes_vertex_array_object&&J(k).forEach(function(a){a.refresh()})}var t=c.maxAttributes,m=Array(t);for(c=0;c<t;++c)m[c]=new Ya;var F=0,k={},h={Record:Ya,scope:{},state:m,currentVAO:null,targetVAO:null,restore:b.oes_vertex_array_object?q:function(){},createVAO:function(a){function b(a){for(var f=0;f<c.buffers.length;++f)c.buffers[f].destroy();
c.buffers.length=0;f=c.attributes;f.length=a.length;for(var d=0;d<a.length;++d){var h=a[d],e=f[d]=new Ya;Array.isArray(h)||G(h)||X(h)?(h=g.create(h,34962,!1,!0),e.buffer=g.getBuffer(h),e.size=e.buffer.dimension|0,e.normalized=!1,e.type=e.buffer.dtype,e.offset=0,e.stride=0,e.divisor=0,e.state=1,c.buffers.push(h)):g.getBuffer(h)?(e.buffer=g.getBuffer(h),e.size=e.buffer.dimension|0,e.normalized=!1,e.type=e.buffer.dtype,e.offset=0,e.stride=0,e.divisor=0,e.state=1):g.getBuffer(h.buffer)?(e.buffer=g.getBuffer(h.buffer),
e.size=(+h.size||e.buffer.dimension)|0,e.normalized=!!h.normalized||!1,e.type="type"in h?Ha[h.type]:e.buffer.dtype,e.offset=(h.offset||0)|0,e.stride=(h.stride||0)|0,e.divisor=(h.divisor||0)|0,e.state=1):"x"in h&&(e.x=+h.x||0,e.y=+h.y||0,e.z=+h.z||0,e.w=+h.w||0,e.state=2)}c.refresh();return b}var c=new u;e.vaoCount+=1;b.destroy=function(){c.destroy()};b._vao=c;b._reglType="vao";return b(a)},getVAO:function(a){return"function"===typeof a&&a._vao?a._vao:null},destroyBuffer:function(b){for(var c=0;c<
m.length;++c){var d=m[c];d.buffer===b&&(a.disableVertexAttribArray(c),d.buffer=null)}},setVAO:b.oes_vertex_array_object?d:r,clear:b.oes_vertex_array_object?n:function(){}};u.prototype.bindAttrs=function(){for(var c=b.angle_instanced_arrays,d=this.attributes,e=0;e<d.length;++e){var h=d[e];h.buffer?(a.enableVertexAttribArray(e),a.bindBuffer(34962,h.buffer.buffer),a.vertexAttribPointer(e,h.size,h.type,h.normalized,h.stride,h.offset),c&&c.vertexAttribDivisorANGLE(e,h.divisor)):(a.disableVertexAttribArray(e),
a.vertexAttrib4f(e,h.x,h.y,h.z,h.w))}for(c=d.length;c<t;++c)a.disableVertexAttribArray(c)};u.prototype.refresh=function(){var a=b.oes_vertex_array_object;a&&(a.bindVertexArrayOES(this.vao),this.bindAttrs(),h.currentVAO=this)};u.prototype.destroy=function(){if(this.vao){var a=b.oes_vertex_array_object;this===h.currentVAO&&(h.currentVAO=null,a.bindVertexArrayOES(null));a.deleteVertexArrayOES(this.vao);this.vao=null}k[this.id]&&(delete k[this.id],--e.vaoCount)};return h}function Qb(a,b,c,e){function g(a,
b,c,d){this.name=a;this.id=b;this.location=c;this.info=d}function d(a,b){for(var c=0;c<a.length;++c)if(a[c].id===b.id){a[c].location=b.location;return}a.push(b)}function r(c,f,d){d=35632===c?q:t;var e=d[f];if(!e){var g=b.str(f),e=a.createShader(c);a.shaderSource(e,g);a.compileShader(e);d[f]=e}return e}function n(a,b){this.id=k++;this.fragId=a;this.vertId=b;this.program=null;this.uniforms=[];this.attributes=[];e.profile&&(this.stats={uniformsCount:0,attributesCount:0})}function u(c,f,k){var m;m=r(35632,
c.fragId);var n=r(35633,c.vertId);f=c.program=a.createProgram();a.attachShader(f,m);a.attachShader(f,n);if(k)for(m=0;m<k.length;++m)n=k[m],a.bindAttribLocation(f,n[0],n[1]);a.linkProgram(f);n=a.getProgramParameter(f,35718);e.profile&&(c.stats.uniformsCount=n);var q=c.uniforms;for(m=0;m<n;++m)if(k=a.getActiveUniform(f,m))if(1<k.size)for(var u=0;u<k.size;++u){var t=k.name.replace("[0]","["+u+"]");d(q,new g(t,b.id(t),a.getUniformLocation(f,t),k))}else d(q,new g(k.name,b.id(k.name),a.getUniformLocation(f,
k.name),k));n=a.getProgramParameter(f,35721);e.profile&&(c.stats.attributesCount=n);c=c.attributes;for(m=0;m<n;++m)(k=a.getActiveAttrib(f,m))&&d(c,new g(k.name,b.id(k.name),a.getAttribLocation(f,k.name),k))}var q={},t={},m={},F=[],k=0;e.profile&&(c.getMaxUniformsCount=function(){var a=0;F.forEach(function(b){b.stats.uniformsCount>a&&(a=b.stats.uniformsCount)});return a},c.getMaxAttributesCount=function(){var a=0;F.forEach(function(b){b.stats.attributesCount>a&&(a=b.stats.attributesCount)});return a});
return{clear:function(){var b=a.deleteShader.bind(a);J(q).forEach(b);q={};J(t).forEach(b);t={};F.forEach(function(b){a.deleteProgram(b.program)});F.length=0;m={};c.shaderCount=0},program:function(a,b,d,e){var g=m[b];g||(g=m[b]={});var k=g[a];if(k&&!e)return k;b=new n(b,a);c.shaderCount++;u(b,d,e);k||(g[a]=b);F.push(b);return b},restore:function(){q={};t={};for(var a=0;a<F.length;++a)u(F[a],null,F[a].attributes.map(function(a){return[a.location,a.name]}))},shader:r,frag:-1,vert:-1}}function Rb(a,b,
c,e,g,d,r){function n(d){var g;g=null===b.next?5121:b.next.colorAttachments[0].texture._texture.type;var m=0,n=0,k=e.framebufferWidth,h=e.framebufferHeight,f=null;G(d)?f=d:d&&(m=d.x|0,n=d.y|0,k=(d.width||e.framebufferWidth-m)|0,h=(d.height||e.framebufferHeight-n)|0,f=d.data||null);c();d=k*h*4;f||(5121===g?f=new Uint8Array(d):5126===g&&(f=f||new Float32Array(d)));a.pixelStorei(3333,4);a.readPixels(m,n,k,h,6408,g,f);return f}function u(a){var c;b.setFBO({framebuffer:a.framebuffer},function(){c=n(a)});
return c}return function(a){return a&&"framebuffer"in a?u(a):n(a)}}function ta(a){return Array.prototype.slice.call(a)}function Aa(a){return ta(a).join("")}function Sb(){function a(){var a=[],b=[];return H(function(){a.push.apply(a,ta(arguments))},{def:function(){var d="v"+c++;b.push(d);0<arguments.length&&(a.push(d,"="),a.push.apply(a,ta(arguments)),a.push(";"));return d},toString:function(){return Aa([0<b.length?"var "+b.join(",")+";":"",Aa(a)])}})}function b(){function b(a,e){d(a,e,"=",c.def(a,
e),";")}var c=a(),d=a(),e=c.toString,g=d.toString;return H(function(){c.apply(c,ta(arguments))},{def:c.def,entry:c,exit:d,save:b,set:function(a,d,e){b(a,d);c(a,d,"=",e,";")},toString:function(){return e()+g()}})}var c=0,e=[],g=[],d=a(),r={};return{global:d,link:function(a){for(var b=0;b<g.length;++b)if(g[b]===a)return e[b];b="g"+c++;e.push(b);g.push(a);return b},block:a,proc:function(a,c){function d(){var a="a"+e.length;e.push(a);return a}var e=[];c=c||0;for(var g=0;g<c;++g)d();var g=b(),F=g.toString;
return r[a]=H(g,{arg:d,toString:function(){return Aa(["function(",e.join(),"){",F(),"}"])}})},scope:b,cond:function(){var a=Aa(arguments),c=b(),d=b(),e=c.toString,g=d.toString;return H(c,{then:function(){c.apply(c,ta(arguments));return this},"else":function(){d.apply(d,ta(arguments));return this},toString:function(){var b=g();b&&(b="else{"+b+"}");return Aa(["if(",a,"){",e(),"}",b])}})},compile:function(){var a=['"use strict";',d,"return {"];Object.keys(r).forEach(function(b){a.push('"',b,'":',r[b].toString(),
",")});a.push("}");var b=Aa(a).replace(/;/g,";\n").replace(/}/g,"}\n").replace(/{/g,"{\n");return Function.apply(null,e.concat(b)).apply(null,g)}}}function Oa(a){return Array.isArray(a)||G(a)||X(a)}function wb(a){return a.sort(function(a,c){return"viewport"===a?-1:"viewport"===c?1:a<c?-1:1})}function P(a,b,c,e){this.thisDep=a;this.contextDep=b;this.propDep=c;this.append=e}function ua(a){return a&&!(a.thisDep||a.contextDep||a.propDep)}function C(a){return new P(!1,!1,!1,a)}function L(a,b){var c=a.type;
return 0===c?(c=a.data.length,new P(!0,1<=c,2<=c,b)):4===c?(c=a.data,new P(c.thisDep,c.contextDep,c.propDep,b)):new P(3===c,2===c,1===c,b)}function Tb(a,b,c,e,g,d,r,n,u,q,t,m,F,k,h){function f(a){return a.replace(".","_")}function p(a,b,c){var d=f(a);Ka.push(a);Ca[d]=pa[d]=!!c;qa[d]=b}function l(a,b,c){var d=f(a);Ka.push(a);Array.isArray(c)?(pa[d]=c.slice(),Ca[d]=c.slice()):pa[d]=Ca[d]=c;ra[d]=b}function v(){var a=Sb(),c=a.link,d=a.global;a.id=ta++;a.batchId="0";var e=c(ka),f=a.shared={props:"a0"};
Object.keys(ka).forEach(function(a){f[a]=d.def(e,".",a)});var g=a.next={},h=a.current={};Object.keys(ra).forEach(function(a){Array.isArray(pa[a])&&(g[a]=d.def(f.next,".",a),h[a]=d.def(f.current,".",a))});var ca=a.constants={};Object.keys(Z).forEach(function(a){ca[a]=d.def(JSON.stringify(Z[a]))});a.invoke=function(b,d){switch(d.type){case 0:var e=["this",f.context,f.props,a.batchId];return b.def(c(d.data),".call(",e.slice(0,Math.max(d.data.length+1,4)),")");case 1:return b.def(f.props,d.data);case 2:return b.def(f.context,
d.data);case 3:return b.def("this",d.data);case 4:return d.data.append(a,b),d.data.ref}};a.attribCache={};var ya={};a.scopeAttrib=function(a){a=b.id(a);if(a in ya)return ya[a];var d=q.scope[a];d||(d=q.scope[a]=new ia);return ya[a]=c(d)};return a}function Q(a){var b=a["static"];a=a.dynamic;var c;if("profile"in b){var d=!!b.profile;c=C(function(a,b){return d});c.enable=d}else if("profile"in a){var e=a.profile;c=L(e,function(a,b){return a.invoke(b,e)})}return c}function z(a,b){var c=a["static"],d=a.dynamic;
if("framebuffer"in c){var e=c.framebuffer;return e?(e=n.getFramebuffer(e),C(function(a,b){var c=a.link(e),d=a.shared;b.set(d.framebuffer,".next",c);d=d.context;b.set(d,".framebufferWidth",c+".width");b.set(d,".framebufferHeight",c+".height");return c})):C(function(a,b){var c=a.shared;b.set(c.framebuffer,".next","null");c=c.context;b.set(c,".framebufferWidth",c+".drawingBufferWidth");b.set(c,".framebufferHeight",c+".drawingBufferHeight");return"null"})}if("framebuffer"in d){var f=d.framebuffer;return L(f,
function(a,b){var c=a.invoke(b,f),d=a.shared,e=d.framebuffer,c=b.def(e,".getFramebuffer(",c,")");b.set(e,".next",c);d=d.context;b.set(d,".framebufferWidth",c+"?"+c+".width:"+d+".drawingBufferWidth");b.set(d,".framebufferHeight",c+"?"+c+".height:"+d+".drawingBufferHeight");return c})}return null}function w(a,b,c){function d(a){if(a in e){var c=e[a];a=!0;var g=c.x|0,y=c.y|0,h,U;"width"in c?h=c.width|0:a=!1;"height"in c?U=c.height|0:a=!1;return new P(!a&&b&&b.thisDep,!a&&b&&b.contextDep,!a&&b&&b.propDep,
function(a,b){var d=a.shared.context,e=h;"width"in c||(e=b.def(d,".","framebufferWidth","-",g));var f=U;"height"in c||(f=b.def(d,".","framebufferHeight","-",y));return[g,y,e,f]})}if(a in f){var k=f[a];a=L(k,function(a,b){var c=a.invoke(b,k),d=a.shared.context,e=b.def(c,".x|0"),f=b.def(c,".y|0"),g=b.def('"width" in ',c,"?",c,".width|0:","(",d,".","framebufferWidth","-",e,")"),c=b.def('"height" in ',c,"?",c,".height|0:","(",d,".","framebufferHeight","-",f,")");return[e,f,g,c]});b&&(a.thisDep=a.thisDep||
b.thisDep,a.contextDep=a.contextDep||b.contextDep,a.propDep=a.propDep||b.propDep);return a}return b?new P(b.thisDep,b.contextDep,b.propDep,function(a,b){var c=a.shared.context;return[0,0,b.def(c,".","framebufferWidth"),b.def(c,".","framebufferHeight")]}):null}var e=a["static"],f=a.dynamic;if(a=d("viewport")){var g=a;a=new P(a.thisDep,a.contextDep,a.propDep,function(a,b){var c=g.append(a,b),d=a.shared.context;b.set(d,".viewportWidth",c[2]);b.set(d,".viewportHeight",c[3]);return c})}return{viewport:a,
scissor_box:d("scissor.box")}}function H(a,b){var c=a["static"];if("string"===typeof c.frag&&"string"===typeof c.vert){if(0<Object.keys(b.dynamic).length)return null;var c=b["static"],d=Object.keys(c);if(0<d.length&&"number"===typeof c[d[0]]){for(var e=[],f=0;f<d.length;++f)e.push([c[d[f]]|0,d[f]]);return e}}return null}function E(a,c,d){function e(a){if(a in f){var c=b.id(f[a]);a=C(function(){return c});a.id=c;return a}if(a in g){var d=g[a];return L(d,function(a,b){var c=a.invoke(b,d);return b.def(a.shared.strings,
".id(",c,")")})}return null}var f=a["static"],g=a.dynamic,h=e("frag"),ca=e("vert"),ya=null;ua(h)&&ua(ca)?(ya=t.program(ca.id,h.id,null,d),a=C(function(a,b){return a.link(ya)})):a=new P(h&&h.thisDep||ca&&ca.thisDep,h&&h.contextDep||ca&&ca.contextDep,h&&h.propDep||ca&&ca.propDep,function(a,b){var c=a.shared.shader,d;d=h?h.append(a,b):b.def(c,".","frag");var e;e=ca?ca.append(a,b):b.def(c,".","vert");return b.def(c+".program("+e+","+d+")")});return{frag:h,vert:ca,progVar:a,program:ya}}function G(a,b){function c(a,
b){if(a in e){var d=e[a]|0;return C(function(a,c){b&&(a.OFFSET=d);return d})}if(a in f){var h=f[a];return L(h,function(a,c){var d=a.invoke(c,h);b&&(a.OFFSET=d);return d})}return b&&g?C(function(a,b){a.OFFSET="0";return 0}):null}var e=a["static"],f=a.dynamic,g=function(){if("elements"in e){var a=e.elements;Oa(a)?a=d.getElements(d.create(a,!0)):a&&(a=d.getElements(a));var b=C(function(b,c){if(a){var d=b.link(a);return b.ELEMENTS=d}return b.ELEMENTS=null});b.value=a;return b}if("elements"in f){var c=
f.elements;return L(c,function(a,b){var d=a.shared,e=d.isBufferArgs,d=d.elements,f=a.invoke(b,c),g=b.def("null"),e=b.def(e,"(",f,")"),f=a.cond(e).then(g,"=",d,".createStream(",f,");")["else"](g,"=",d,".getElements(",f,");");b.entry(f);b.exit(a.cond(e).then(d,".destroyStream(",g,");"));return a.ELEMENTS=g})}return null}(),h=c("offset",!0);return{elements:g,primitive:function(){if("primitive"in e){var a=e.primitive;return C(function(b,c){return Sa[a]})}if("primitive"in f){var b=f.primitive;return L(b,
function(a,c){var d=a.constants.primTypes,e=a.invoke(c,b);return c.def(d,"[",e,"]")})}return g?ua(g)?g.value?C(function(a,b){return b.def(a.ELEMENTS,".primType")}):C(function(){return 4}):new P(g.thisDep,g.contextDep,g.propDep,function(a,b){var c=a.ELEMENTS;return b.def(c,"?",c,".primType:",4)}):null}(),count:function(){if("count"in e){var a=e.count|0;return C(function(){return a})}if("count"in f){var b=f.count;return L(b,function(a,c){return a.invoke(c,b)})}return g?ua(g)?g?h?new P(h.thisDep,h.contextDep,
h.propDep,function(a,b){return b.def(a.ELEMENTS,".vertCount-",a.OFFSET)}):C(function(a,b){return b.def(a.ELEMENTS,".vertCount")}):C(function(){return-1}):new P(g.thisDep||h.thisDep,g.contextDep||h.contextDep,g.propDep||h.propDep,function(a,b){var c=a.ELEMENTS;return a.OFFSET?b.def(c,"?",c,".vertCount-",a.OFFSET,":-1"):b.def(c,"?",c,".vertCount:-1")}):null}(),instances:c("instances",!1),offset:h}}function R(a,b){var c=a["static"],d=a.dynamic,e={};Ka.forEach(function(a){function b(f,h){if(a in c){var y=
f(c[a]);e[g]=C(function(){return y})}else if(a in d){var I=d[a];e[g]=L(I,function(a,b){return h(a,b,a.invoke(b,I))})}}var g=f(a);switch(a){case "cull.enable":case "blend.enable":case "dither":case "stencil.enable":case "depth.enable":case "scissor.enable":case "polygonOffset.enable":case "sample.alpha":case "sample.enable":case "depth.mask":return b(function(a){return a},function(a,b,c){return c});case "depth.func":return b(function(a){return $a[a]},function(a,b,c){return b.def(a.constants.compareFuncs,
"[",c,"]")});case "depth.range":return b(function(a){return a},function(a,b,c){a=b.def("+",c,"[0]");b=b.def("+",c,"[1]");return[a,b]});case "blend.func":return b(function(a){return[Ea["srcRGB"in a?a.srcRGB:a.src],Ea["dstRGB"in a?a.dstRGB:a.dst],Ea["srcAlpha"in a?a.srcAlpha:a.src],Ea["dstAlpha"in a?a.dstAlpha:a.dst]]},function(a,b,c){function d(a,e){return b.def('"',a,e,'" in ',c,"?",c,".",a,e,":",c,".",a)}a=a.constants.blendFuncs;var e=d("src","RGB"),f=d("dst","RGB"),e=b.def(a,"[",e,"]"),g=b.def(a,
"[",d("src","Alpha"),"]"),f=b.def(a,"[",f,"]");a=b.def(a,"[",d("dst","Alpha"),"]");return[e,f,g,a]});case "blend.equation":return b(function(a){if("string"===typeof a)return[W[a],W[a]];if("object"===typeof a)return[W[a.rgb],W[a.alpha]]},function(a,b,c){var d=a.constants.blendEquations,e=b.def(),f=b.def();a=a.cond("typeof ",c,'==="string"');a.then(e,"=",f,"=",d,"[",c,"];");a["else"](e,"=",d,"[",c,".rgb];",f,"=",d,"[",c,".alpha];");b(a);return[e,f]});case "blend.color":return b(function(a){return A(4,
function(b){return+a[b]})},function(a,b,c){return A(4,function(a){return b.def("+",c,"[",a,"]")})});case "stencil.mask":return b(function(a){return a|0},function(a,b,c){return b.def(c,"|0")});case "stencil.func":return b(function(a){return[$a[a.cmp||"keep"],a.ref||0,"mask"in a?a.mask:-1]},function(a,b,c){a=b.def('"cmp" in ',c,"?",a.constants.compareFuncs,"[",c,".cmp]",":",7680);var d=b.def(c,".ref|0");b=b.def('"mask" in ',c,"?",c,".mask|0:-1");return[a,d,b]});case "stencil.opFront":case "stencil.opBack":return b(function(b){return["stencil.opBack"===
a?1029:1028,Pa[b.fail||"keep"],Pa[b.zfail||"keep"],Pa[b.zpass||"keep"]]},function(b,c,d){function e(a){return c.def('"',a,'" in ',d,"?",f,"[",d,".",a,"]:",7680)}var f=b.constants.stencilOps;return["stencil.opBack"===a?1029:1028,e("fail"),e("zfail"),e("zpass")]});case "polygonOffset.offset":return b(function(a){return[a.factor|0,a.units|0]},function(a,b,c){a=b.def(c,".factor|0");b=b.def(c,".units|0");return[a,b]});case "cull.face":return b(function(a){var b=0;"front"===a?b=1028:"back"===a&&(b=1029);
return b},function(a,b,c){return b.def(c,'==="front"?',1028,":",1029)});case "lineWidth":return b(function(a){return a},function(a,b,c){return c});case "frontFace":return b(function(a){return xb[a]},function(a,b,c){return b.def(c+'==="cw"?2304:2305')});case "colorMask":return b(function(a){return a.map(function(a){return!!a})},function(a,b,c){return A(4,function(a){return"!!"+c+"["+a+"]"})});case "sample.coverage":return b(function(a){return["value"in a?a.value:1,!!a.invert]},function(a,b,c){a=b.def('"value" in ',
c,"?+",c,".value:1");b=b.def("!!",c,".invert");return[a,b]})}});return e}function sa(a,b){var c=a["static"],d=a.dynamic,e={};Object.keys(c).forEach(function(a){var b=c[a],d;if("number"===typeof b||"boolean"===typeof b)d=C(function(){return b});else if("function"===typeof b){var f=b._reglType;if("texture2d"===f||"textureCube"===f)d=C(function(a){return a.link(b)});else if("framebuffer"===f||"framebufferCube"===f)d=C(function(a){return a.link(b.color[0])})}else na(b)&&(d=C(function(a){return a.global.def("[",
A(b.length,function(a){return b[a]}),"]")}));d.value=b;e[a]=d});Object.keys(d).forEach(function(a){var b=d[a];e[a]=L(b,function(a,c){return a.invoke(c,b)})});return e}function J(a,c){var d=a["static"],e=a.dynamic,f={};Object.keys(d).forEach(function(a){var c=d[a],e=b.id(a),h=new ia;if(Oa(c))h.state=1,h.buffer=g.getBuffer(g.create(c,34962,!1,!0)),h.type=0;else{var y=g.getBuffer(c);if(y)h.state=1,h.buffer=y,h.type=0;else if("constant"in c){var I=c.constant;h.buffer="null";h.state=2;"number"===typeof I?
h.x=I:Ba.forEach(function(a,b){b<I.length&&(h[a]=I[b])})}else{var y=Oa(c.buffer)?g.getBuffer(g.create(c.buffer,34962,!1,!0)):g.getBuffer(c.buffer),k=c.offset|0,m=c.stride|0,da=c.size|0,n=!!c.normalized,l=0;"type"in c&&(l=Ha[c.type]);c=c.divisor|0;h.buffer=y;h.state=1;h.size=da;h.normalized=n;h.type=l||y.dtype;h.offset=k;h.stride=m;h.divisor=c}}f[a]=C(function(a,b){var c=a.attribCache;if(e in c)return c[e];var d={isStream:!1};Object.keys(h).forEach(function(a){d[a]=h[a]});h.buffer&&(d.buffer=a.link(h.buffer),
d.type=d.type||d.buffer+".dtype");return c[e]=d})});Object.keys(e).forEach(function(a){var b=e[a];f[a]=L(b,function(a,c){function d(a){c(y[a],"=",e,".",a,"|0;")}var e=a.invoke(c,b),f=a.shared,g=a.constants,h=f.isBufferArgs,f=f.buffer,y={isStream:c.def(!1)},I=new ia;I.state=1;Object.keys(I).forEach(function(a){y[a]=c.def(""+I[a])});var k=y.buffer,U=y.type;c("if(",h,"(",e,")){",y.isStream,"=true;",k,"=",f,".createStream(",34962,",",e,");",U,"=",k,".dtype;","}else{",k,"=",f,".getBuffer(",e,");","if(",
k,"){",U,"=",k,".dtype;",'}else if("constant" in ',e,"){",y.state,"=",2,";","if(typeof "+e+'.constant === "number"){',y[Ba[0]],"=",e,".constant;",Ba.slice(1).map(function(a){return y[a]}).join("="),"=0;","}else{",Ba.map(function(a,b){return y[a]+"="+e+".constant.length>"+b+"?"+e+".constant["+b+"]:0;"}).join(""),"}}else{","if(",h,"(",e,".buffer)){",k,"=",f,".createStream(",34962,",",e,".buffer);","}else{",k,"=",f,".getBuffer(",e,".buffer);","}",U,'="type" in ',e,"?",g.glTypes,"[",e,".type]:",k,".dtype;",
y.normalized,"=!!",e,".normalized;");d("size");d("offset");d("stride");d("divisor");c("}}");c.exit("if(",y.isStream,"){",f,".destroyStream(",k,");","}");return y})});return f}function D(a,b){var c=a["static"],d=a.dynamic;if("vao"in c){var e=c.vao;null!==e&&null===q.getVAO(e)&&(e=q.createVAO(e));return C(function(a){return a.link(q.getVAO(e))})}if("vao"in d){var f=d.vao;return L(f,function(a,b){var c=a.invoke(b,f);return b.def(a.shared.vao+".getVAO("+c+")")})}return null}function x(a){var b=a["static"],
c=a.dynamic,d={};Object.keys(b).forEach(function(a){var c=b[a];d[a]=C(function(a,b){return"number"===typeof c||"boolean"===typeof c?""+c:a.link(c)})});Object.keys(c).forEach(function(a){var b=c[a];d[a]=L(b,function(a,c){return a.invoke(c,b)})});return d}function la(a,b,d,e,g){function h(a){var b=n[a];b&&(Za[a]=b)}var k=H(a,b),m=z(a,g),n=w(a,m,g),l=G(a,g),Za=R(a,g),p=E(a,g,k);h("viewport");h(f("scissor.box"));var r=0<Object.keys(Za).length,m={framebuffer:m,draw:l,shader:p,state:Za,dirty:r,scopeVAO:null,
drawVAO:null,useVAO:!1,attributes:{}};m.profile=Q(a,g);m.uniforms=sa(d,g);m.drawVAO=m.scopeVAO=D(a,g);if(!m.drawVAO&&p.program&&!k&&c.angle_instanced_arrays){var t=!0;a=p.program.attributes.map(function(a){a=b["static"][a];t=t&&!!a;return a});if(t&&0<a.length){var v=q.getVAO(q.createVAO(a));m.drawVAO=new P(null,null,null,function(a,b){return a.link(v)});m.useVAO=!0}}k?m.useVAO=!0:m.attributes=J(b,g);m.context=x(e,g);return m}function T(a,b,c){var d=a.shared.context,e=a.scope();Object.keys(c).forEach(function(f){b.save(d,
"."+f);e(d,".",f,"=",c[f].append(a,b),";")});b(e)}function O(a,b,c,d){var e=a.shared,f=e.gl,g=e.framebuffer,h;Ja&&(h=b.def(e.extensions,".webgl_draw_buffers"));var k=a.constants,e=k.drawBuffer,k=k.backBuffer;a=c?c.append(a,b):b.def(g,".next");d||b("if(",a,"!==",g,".cur){");b("if(",a,"){",f,".bindFramebuffer(",36160,",",a,".framebuffer);");Ja&&b(h,".drawBuffersWEBGL(",e,"[",a,".colorAttachments.length]);");b("}else{",f,".bindFramebuffer(",36160,",null);");Ja&&b(h,".drawBuffersWEBGL(",k,");");b("}",
g,".cur=",a,";");d||b("}")}function S(a,b,c){var d=a.shared,e=d.gl,g=a.current,h=a.next,k=d.current,m=d.next,n=a.cond(k,".dirty");Ka.forEach(function(b){b=f(b);if(!(b in c.state)){var d,I;if(b in h){d=h[b];I=g[b];var l=A(pa[b].length,function(a){return n.def(d,"[",a,"]")});n(a.cond(l.map(function(a,b){return a+"!=="+I+"["+b+"]"}).join("||")).then(e,".",ra[b],"(",l,");",l.map(function(a,b){return I+"["+b+"]="+a}).join(";"),";"))}else d=n.def(m,".",b),l=a.cond(d,"!==",k,".",b),n(l),b in qa?l(a.cond(d).then(e,
".enable(",qa[b],");")["else"](e,".disable(",qa[b],");"),k,".",b,"=",d,";"):l(e,".",ra[b],"(",d,");",k,".",b,"=",d,";")}});0===Object.keys(c.state).length&&n(k,".dirty=false;");b(n)}function K(a,b,c,d){var e=a.shared,f=a.current,g=e.current,h=e.gl;wb(Object.keys(c)).forEach(function(e){var k=c[e];if(!d||d(k)){var m=k.append(a,b);if(qa[e]){var n=qa[e];ua(k)?m?b(h,".enable(",n,");"):b(h,".disable(",n,");"):b(a.cond(m).then(h,".enable(",n,");")["else"](h,".disable(",n,");"));b(g,".",e,"=",m,";")}else if(na(m)){var l=
f[e];b(h,".",ra[e],"(",m,");",m.map(function(a,b){return l+"["+b+"]="+a}).join(";"),";")}else b(h,".",ra[e],"(",m,");",g,".",e,"=",m,";")}})}function B(a,b){oa&&(a.instancing=b.def(a.shared.extensions,".angle_instanced_arrays"))}function V(a,b,c,d,e){function f(){return"undefined"===typeof performance?"Date.now()":"performance.now()"}function g(a){q=b.def();a(q,"=",f(),";");"string"===typeof e?a(l,".count+=",e,";"):a(l,".count++;");k&&(d?(t=b.def(),a(t,"=",r,".getNumPendingQueries();")):a(r,".beginQuery(",
l,");"))}function h(a){a(l,".cpuTime+=",f(),"-",q,";");k&&(d?a(r,".pushScopeStats(",t,",",r,".getNumPendingQueries(),",l,");"):a(r,".endQuery();"))}function m(a){var c=b.def(p,".profile");b(p,".profile=",a,";");b.exit(p,".profile=",c,";")}var n=a.shared,l=a.stats,p=n.current,r=n.timer;c=c.profile;var q,t;if(c){if(ua(c)){c.enable?(g(b),h(b.exit),m("true")):m("false");return}c=c.append(a,b);m(c)}else c=b.def(p,".profile");n=a.block();g(n);b("if(",c,"){",n,"}");a=a.block();h(a);b.exit("if(",c,"){",a,
"}")}function N(a,b,c,d,e){function f(a){switch(a){case 35664:case 35667:case 35671:return 2;case 35665:case 35668:case 35672:return 3;case 35666:case 35669:case 35673:return 4;default:return 1}}function g(c,d,e){function f(){b("if(!",l,".buffer){",m,".enableVertexAttribArray(",n,");}");var c=e.type,g;g=e.size?b.def(e.size,"||",d):d;b("if(",l,".type!==",c,"||",l,".size!==",g,"||",da.map(function(a){return l+"."+a+"!=="+e[a]}).join("||"),"){",m,".bindBuffer(",34962,",",U,".buffer);",m,".vertexAttribPointer(",
[n,g,c,e.normalized,e.stride,e.offset],");",l,".type=",c,";",l,".size=",g,";",da.map(function(a){return l+"."+a+"="+e[a]+";"}).join(""),"}");oa&&(c=e.divisor,b("if(",l,".divisor!==",c,"){",a.instancing,".vertexAttribDivisorANGLE(",[n,c],");",l,".divisor=",c,";}"))}function k(){b("if(",l,".buffer){",m,".disableVertexAttribArray(",n,");",l,".buffer=null;","}if(",Ba.map(function(a,b){return l+"."+a+"!=="+p[b]}).join("||"),"){",m,".vertexAttrib4f(",n,",",p,");",Ba.map(function(a,b){return l+"."+a+"="+
p[b]+";"}).join(""),"}")}var m=h.gl,n=b.def(c,".location"),l=b.def(h.attributes,"[",n,"]");c=e.state;var U=e.buffer,p=[e.x,e.y,e.z,e.w],da=["buffer","normalized","offset","stride"];1===c?f():2===c?k():(b("if(",c,"===",1,"){"),f(),b("}else{"),k(),b("}"))}var h=a.shared;d.forEach(function(d){var h=d.name,k=c.attributes[h],m;if(k){if(!e(k))return;m=k.append(a,b)}else{if(!e(yb))return;var n=a.scopeAttrib(h);m={};Object.keys(new ia).forEach(function(a){m[a]=b.def(n,".",a)})}g(a.link(d),f(d.info.type),
m)})}function wa(a,c,d,e,f){for(var g=a.shared,h=g.gl,k,m=0;m<e.length;++m){var n=e[m],l=n.name,p=n.info.type,r=d.uniforms[l],n=a.link(n)+".location",q;if(r){if(!f(r))continue;if(ua(r)){l=r.value;if(35678===p||35680===p)p=a.link(l._texture||l.color[0]._texture),c(h,".uniform1i(",n,",",p+".bind());"),c.exit(p,".unbind();");else if(35674===p||35675===p||35676===p)l=a.global.def("new Float32Array(["+Array.prototype.slice.call(l)+"])"),r=2,35675===p?r=3:35676===p&&(r=4),c(h,".uniformMatrix",r,"fv(",n,
",false,",l,");");else{switch(p){case 5126:k="1f";break;case 35664:k="2f";break;case 35665:k="3f";break;case 35666:k="4f";break;case 35670:k="1i";break;case 5124:k="1i";break;case 35671:k="2i";break;case 35667:k="2i";break;case 35672:k="3i";break;case 35668:k="3i";break;case 35673:k="4i";break;case 35669:k="4i"}c(h,".uniform",k,"(",n,",",na(l)?Array.prototype.slice.call(l):l,");")}continue}else q=r.append(a,c)}else{if(!f(yb))continue;q=c.def(g.uniforms,"[",b.id(l),"]")}35678===p?c("if(",q,"&&",q,
'._reglType==="framebuffer"){',q,"=",q,".color[0];","}"):35680===p&&c("if(",q,"&&",q,'._reglType==="framebufferCube"){',q,"=",q,".color[0];","}");l=1;switch(p){case 35678:case 35680:p=c.def(q,"._texture");c(h,".uniform1i(",n,",",p,".bind());");c.exit(p,".unbind();");continue;case 5124:case 35670:k="1i";break;case 35667:case 35671:k="2i";l=2;break;case 35668:case 35672:k="3i";l=3;break;case 35669:case 35673:k="4i";l=4;break;case 5126:k="1f";break;case 35664:k="2f";l=2;break;case 35665:k="3f";l=3;break;
case 35666:k="4f";l=4;break;case 35674:k="Matrix2fv";break;case 35675:k="Matrix3fv";break;case 35676:k="Matrix4fv"}c(h,".uniform",k,"(",n,",");if("M"===k.charAt(0)){var n=Math.pow(p-35674+2,2),t=a.global.def("new Float32Array(",n,")");c("false,(Array.isArray(",q,")||",q," instanceof Float32Array)?",q,":(",A(n,function(a){return t+"["+a+"]="+q+"["+a+"]"}),",",t,")")}else 1<l?c(A(l,function(a){return q+"["+a+"]"})):c(q);c(");")}}function aa(a,b,c,d){function e(f){var g=l[f];return g?g.contextDep&&d.contextDynamic||
g.propDep?g.append(a,c):g.append(a,b):b.def(m,".",f)}function f(){function a(){c(v,".drawElementsInstancedANGLE(",[p,r,u,q+"<<(("+u+"-5121)>>1)",t],");")}function b(){c(v,".drawArraysInstancedANGLE(",[p,q,r,t],");")}n?ba?a():(c("if(",n,"){"),a(),c("}else{"),b(),c("}")):b()}function g(){function a(){c(k+".drawElements("+[p,r,u,q+"<<(("+u+"-5121)>>1)"]+");")}function b(){c(k+".drawArrays("+[p,q,r]+");")}n?ba?a():(c("if(",n,"){"),a(),c("}else{"),b(),c("}")):b()}var h=a.shared,k=h.gl,m=h.draw,l=d.draw,
n=function(){var e=l.elements,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f)}else e=f.def(m,".","elements");e&&f("if("+e+")"+k+".bindBuffer(34963,"+e+".buffer.buffer);");return e}(),p=e("primitive"),q=e("offset"),r=function(){var e=l.count,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f)}else e=f.def(m,".","count");return e}();if("number"===typeof r){if(0===r)return}else c("if(",r,"){"),c.exit("}");var t,v;oa&&(t=e("instances"),v=a.instancing);
var u=n+".type",ba=l.elements&&ua(l.elements);oa&&("number"!==typeof t||0<=t)?"string"===typeof t?(c("if(",t,">0){"),f(),c("}else if(",t,"<0){"),g(),c("}")):f():g()}function xa(a,b,c,d,e){b=v();e=b.proc("body",e);oa&&(b.instancing=e.def(b.shared.extensions,".angle_instanced_arrays"));a(b,e,c,d);return b.compile().body}function ba(a,b,c,d){B(a,b);c.useVAO?c.drawVAO?b(a.shared.vao,".setVAO(",c.drawVAO.append(a,b),");"):b(a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);"):(b(a.shared.vao,".setVAO(null);"),
N(a,b,c,d.attributes,function(){return!0}));wa(a,b,c,d.uniforms,function(){return!0});aa(a,b,b,c)}function Da(a,b){var c=a.proc("draw",1);B(a,c);T(a,c,b.context);O(a,c,b.framebuffer);S(a,c,b);K(a,c,b.state);V(a,c,b,!1,!0);var d=b.shader.progVar.append(a,c);c(a.shared.gl,".useProgram(",d,".program);");if(b.shader.program)ba(a,c,b,b.shader.program);else{c(a.shared.vao,".setVAO(null);");var e=a.global.def("{}"),f=c.def(d,".id"),g=c.def(e,"[",f,"]");c(a.cond(g).then(g,".call(this,a0);")["else"](g,"=",
e,"[",f,"]=",a.link(function(c){return xa(ba,a,b,c,1)}),"(",d,");",g,".call(this,a0);"))}0<Object.keys(b.state).length&&c(a.shared.current,".dirty=true;")}function fa(a,b,c,d){function e(){return!0}a.batchId="a1";B(a,b);N(a,b,c,d.attributes,e);wa(a,b,c,d.uniforms,e);aa(a,b,b,c)}function M(a,b,c,d){function e(a){return a.contextDep&&g||a.propDep}function f(a){return!e(a)}B(a,b);var g=c.contextDep,h=b.def(),k=b.def();a.shared.props=k;a.batchId=h;var m=a.scope(),l=a.scope();b(m.entry,"for(",h,"=0;",
h,"<","a1",";++",h,"){",k,"=","a0","[",h,"];",l,"}",m.exit);c.needsContext&&T(a,l,c.context);c.needsFramebuffer&&O(a,l,c.framebuffer);K(a,l,c.state,e);c.profile&&e(c.profile)&&V(a,l,c,!1,!0);d?(c.useVAO?c.drawVAO?e(c.drawVAO)?l(a.shared.vao,".setVAO(",c.drawVAO.append(a,l),");"):m(a.shared.vao,".setVAO(",c.drawVAO.append(a,m),");"):m(a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);"):(m(a.shared.vao,".setVAO(null);"),N(a,m,c,d.attributes,f),N(a,l,c,d.attributes,e)),wa(a,m,c,d.uniforms,f),wa(a,l,
c,d.uniforms,e),aa(a,m,l,c)):(b=a.global.def("{}"),d=c.shader.progVar.append(a,l),k=l.def(d,".id"),m=l.def(b,"[",k,"]"),l(a.shared.gl,".useProgram(",d,".program);","if(!",m,"){",m,"=",b,"[",k,"]=",a.link(function(b){return xa(fa,a,c,b,2)}),"(",d,");}",m,".call(this,a0[",h,"],",h,");"))}function X(a,b){function c(a){return a.contextDep&&e||a.propDep}var d=a.proc("batch",2);a.batchId="0";B(a,d);var e=!1,f=!0;Object.keys(b.context).forEach(function(a){e=e||b.context[a].propDep});e||(T(a,d,b.context),
f=!1);var g=b.framebuffer,h=!1;g?(g.propDep?e=h=!0:g.contextDep&&e&&(h=!0),h||O(a,d,g)):O(a,d,null);b.state.viewport&&b.state.viewport.propDep&&(e=!0);S(a,d,b);K(a,d,b.state,function(a){return!c(a)});b.profile&&c(b.profile)||V(a,d,b,!1,"a1");b.contextDep=e;b.needsContext=f;b.needsFramebuffer=h;f=b.shader.progVar;if(f.contextDep&&e||f.propDep)M(a,d,b,null);else if(f=f.append(a,d),d(a.shared.gl,".useProgram(",f,".program);"),b.shader.program)M(a,d,b,b.shader.program);else{d(a.shared.vao,".setVAO(null);");
var g=a.global.def("{}"),h=d.def(f,".id"),k=d.def(g,"[",h,"]");d(a.cond(k).then(k,".call(this,a0,a1);")["else"](k,"=",g,"[",h,"]=",a.link(function(c){return xa(M,a,b,c,2)}),"(",f,");",k,".call(this,a0,a1);"))}0<Object.keys(b.state).length&&d(a.shared.current,".dirty=true;")}function Y(a,c){function d(b){var g=c.shader[b];g&&e.set(f.shader,"."+b,g.append(a,e))}var e=a.proc("scope",3);a.batchId="a2";var f=a.shared,g=f.current;T(a,e,c.context);c.framebuffer&&c.framebuffer.append(a,e);wb(Object.keys(c.state)).forEach(function(b){var d=
c.state[b].append(a,e);na(d)?d.forEach(function(c,d){e.set(a.next[b],"["+d+"]",c)}):e.set(f.next,"."+b,d)});V(a,e,c,!0,!0);["elements","offset","count","instances","primitive"].forEach(function(b){var d=c.draw[b];d&&e.set(f.draw,"."+b,""+d.append(a,e))});Object.keys(c.uniforms).forEach(function(d){e.set(f.uniforms,"["+b.id(d)+"]",c.uniforms[d].append(a,e))});Object.keys(c.attributes).forEach(function(b){var d=c.attributes[b].append(a,e),f=a.scopeAttrib(b);Object.keys(new ia).forEach(function(a){e.set(f,
"."+a,d[a])})});c.scopeVAO&&e.set(f.vao,".targetVAO",c.scopeVAO.append(a,e));d("vert");d("frag");0<Object.keys(c.state).length&&(e(g,".dirty=true;"),e.exit(g,".dirty=true;"));e("a1(",a.shared.context,",a0,",a.batchId,");")}function ha(a){if("object"===typeof a&&!na(a)){for(var b=Object.keys(a),c=0;c<b.length;++c)if(ga.isDynamic(a[b[c]]))return!0;return!1}}function ja(a,b,c){function d(a,b){g.forEach(function(c){var d=e[c];ga.isDynamic(d)&&(d=a.invoke(b,d),b(l,".",c,"=",d,";"))})}var e=b["static"][c];
if(e&&ha(e)){var f=a.global,g=Object.keys(e),h=!1,k=!1,m=!1,l=a.global.def("{}");g.forEach(function(b){var c=e[b];if(ga.isDynamic(c))"function"===typeof c&&(c=e[b]=ga.unbox(c)),b=L(c,null),h=h||b.thisDep,m=m||b.propDep,k=k||b.contextDep;else{f(l,".",b,"=");switch(typeof c){case "number":f(c);break;case "string":f('"',c,'"');break;case "object":Array.isArray(c)&&f("[",c.join(),"]");break;default:f(a.link(c))}f(";")}});b.dynamic[c]=new ga.DynamicVariable(4,{thisDep:h,contextDep:k,propDep:m,ref:l,append:d});
delete b["static"][c]}}var ia=q.Record,W={add:32774,subtract:32778,"reverse subtract":32779};c.ext_blend_minmax&&(W.min=32775,W.max=32776);var oa=c.angle_instanced_arrays,Ja=c.webgl_draw_buffers,pa={dirty:!0,profile:h.profile},Ca={},Ka=[],qa={},ra={};p("dither",3024);p("blend.enable",3042);l("blend.color","blendColor",[0,0,0,0]);l("blend.equation","blendEquationSeparate",[32774,32774]);l("blend.func","blendFuncSeparate",[1,0,1,0]);p("depth.enable",2929,!0);l("depth.func","depthFunc",513);l("depth.range",
"depthRange",[0,1]);l("depth.mask","depthMask",!0);l("colorMask","colorMask",[!0,!0,!0,!0]);p("cull.enable",2884);l("cull.face","cullFace",1029);l("frontFace","frontFace",2305);l("lineWidth","lineWidth",1);p("polygonOffset.enable",32823);l("polygonOffset.offset","polygonOffset",[0,0]);p("sample.alpha",32926);p("sample.enable",32928);l("sample.coverage","sampleCoverage",[1,!1]);p("stencil.enable",2960);l("stencil.mask","stencilMask",-1);l("stencil.func","stencilFunc",[519,0,-1]);l("stencil.opFront",
"stencilOpSeparate",[1028,7680,7680,7680]);l("stencil.opBack","stencilOpSeparate",[1029,7680,7680,7680]);p("scissor.enable",3089);l("scissor.box","scissor",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);l("viewport","viewport",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);var ka={gl:a,context:F,strings:b,next:Ca,current:pa,draw:m,elements:d,buffer:g,shader:t,attributes:q.state,vao:q,uniforms:u,framebuffer:n,extensions:c,timer:k,isBufferArgs:Oa},Z={primTypes:Sa,compareFuncs:$a,blendFuncs:Ea,
blendEquations:W,stencilOps:Pa,glTypes:Ha,orientationType:xb};Ja&&(Z.backBuffer=[1029],Z.drawBuffer=A(e.maxDrawbuffers,function(a){return 0===a?[0]:A(a,function(a){return 36064+a})}));var ta=0;return{next:Ca,current:pa,procs:function(){var a=v(),b=a.proc("poll"),d=a.proc("refresh"),f=a.block();b(f);d(f);var g=a.shared,h=g.gl,k=g.next,m=g.current;f(m,".dirty=false;");O(a,b);O(a,d,null,!0);var l;oa&&(l=a.link(oa));c.oes_vertex_array_object&&d(a.link(c.oes_vertex_array_object),".bindVertexArrayOES(null);");
for(var n=0;n<e.maxAttributes;++n){var p=d.def(g.attributes,"[",n,"]"),q=a.cond(p,".buffer");q.then(h,".enableVertexAttribArray(",n,");",h,".bindBuffer(",34962,",",p,".buffer.buffer);",h,".vertexAttribPointer(",n,",",p,".size,",p,".type,",p,".normalized,",p,".stride,",p,".offset);")["else"](h,".disableVertexAttribArray(",n,");",h,".vertexAttrib4f(",n,",",p,".x,",p,".y,",p,".z,",p,".w);",p,".buffer=null;");d(q);oa&&d(l,".vertexAttribDivisorANGLE(",n,",",p,".divisor);")}d(a.shared.vao,".currentVAO=null;",
a.shared.vao,".setVAO(",a.shared.vao,".targetVAO);");Object.keys(qa).forEach(function(c){var e=qa[c],g=f.def(k,".",c),l=a.block();l("if(",g,"){",h,".enable(",e,")}else{",h,".disable(",e,")}",m,".",c,"=",g,";");d(l);b("if(",g,"!==",m,".",c,"){",l,"}")});Object.keys(ra).forEach(function(c){var e=ra[c],g=pa[c],l,n,p=a.block();p(h,".",e,"(");na(g)?(e=g.length,l=a.global.def(k,".",c),n=a.global.def(m,".",c),p(A(e,function(a){return l+"["+a+"]"}),");",A(e,function(a){return n+"["+a+"]="+l+"["+a+"];"}).join("")),
b("if(",A(e,function(a){return l+"["+a+"]!=="+n+"["+a+"]"}).join("||"),"){",p,"}")):(l=f.def(k,".",c),n=f.def(m,".",c),p(l,");",m,".",c,"=",l,";"),b("if(",l,"!==",n,"){",p,"}"));d(p)});return a.compile()}(),compile:function(a,b,c,d,e){var f=v();f.stats=f.link(e);Object.keys(b["static"]).forEach(function(a){ja(f,b,a)});Ub.forEach(function(b){ja(f,a,b)});c=la(a,b,c,d,f);Da(f,c);Y(f,c);X(f,c);return f.compile()}}}function zb(a,b){for(var c=0;c<a.length;++c)if(a[c]===b)return c;return-1}var H=function(a,
b){for(var c=Object.keys(b),e=0;e<c.length;++e)a[c[e]]=b[c[e]];return a},Bb=0,ga={DynamicVariable:ja,define:function(a,b){return new ja(a,bb(b+""))},isDynamic:function(a){return"function"===typeof a&&!a._reglType||a instanceof ja},unbox:function(a,b){return"function"===typeof a?new ja(0,a):a},accessor:bb},ab={next:"function"===typeof requestAnimationFrame?function(a){return requestAnimationFrame(a)}:function(a){return setTimeout(a,16)},cancel:"function"===typeof cancelAnimationFrame?function(a){return cancelAnimationFrame(a)}:
clearTimeout},Ab="undefined"!==typeof performance&&performance.now?function(){return performance.now()}:function(){return+new Date},z=fb();z.zero=fb();var Vb=function(a,b){var c=1;b.ext_texture_filter_anisotropic&&(c=a.getParameter(34047));var e=1,g=1;b.webgl_draw_buffers&&(e=a.getParameter(34852),g=a.getParameter(36063));var d=!!b.oes_texture_float;if(d){d=a.createTexture();a.bindTexture(3553,d);a.texImage2D(3553,0,6408,1,1,0,6408,5126,null);var r=a.createFramebuffer();a.bindFramebuffer(36160,r);
a.framebufferTexture2D(36160,36064,3553,d,0);a.bindTexture(3553,null);if(36053!==a.checkFramebufferStatus(36160))d=!1;else{a.viewport(0,0,1,1);a.clearColor(1,0,0,1);a.clear(16384);var n=z.allocType(5126,4);a.readPixels(0,0,1,1,6408,5126,n);a.getError()?d=!1:(a.deleteFramebuffer(r),a.deleteTexture(d),d=1===n[0]);z.freeType(n)}}n=!0;"undefined"!==typeof navigator&&(/MSIE/.test(navigator.userAgent)||/Trident\//.test(navigator.appVersion)||/Edge/.test(navigator.userAgent))||(n=a.createTexture(),r=z.allocType(5121,
36),a.activeTexture(33984),a.bindTexture(34067,n),a.texImage2D(34069,0,6408,3,3,0,6408,5121,r),z.freeType(r),a.bindTexture(34067,null),a.deleteTexture(n),n=!a.getError());return{colorBits:[a.getParameter(3410),a.getParameter(3411),a.getParameter(3412),a.getParameter(3413)],depthBits:a.getParameter(3414),stencilBits:a.getParameter(3415),subpixelBits:a.getParameter(3408),extensions:Object.keys(b).filter(function(a){return!!b[a]}),maxAnisotropic:c,maxDrawbuffers:e,maxColorAttachments:g,pointSizeDims:a.getParameter(33901),
lineWidthDims:a.getParameter(33902),maxViewportDims:a.getParameter(3386),maxCombinedTextureUnits:a.getParameter(35661),maxCubeMapSize:a.getParameter(34076),maxRenderbufferSize:a.getParameter(34024),maxTextureUnits:a.getParameter(34930),maxTextureSize:a.getParameter(3379),maxAttributes:a.getParameter(34921),maxVertexUniforms:a.getParameter(36347),maxVertexTextureUnits:a.getParameter(35660),maxVaryingVectors:a.getParameter(36348),maxFragmentUniforms:a.getParameter(36349),glsl:a.getParameter(35724),
renderer:a.getParameter(7937),vendor:a.getParameter(7936),version:a.getParameter(7938),readFloat:d,npotTextureCube:n}},G=function(a){return a instanceof Uint8Array||a instanceof Uint16Array||a instanceof Uint32Array||a instanceof Int8Array||a instanceof Int16Array||a instanceof Int32Array||a instanceof Float32Array||a instanceof Float64Array||a instanceof Uint8ClampedArray},J=function(a){return Object.keys(a).map(function(b){return a[b]})},Ma={shape:function(a){for(var b=[];a.length;a=a[0])b.push(a.length);
return b},flatten:function(a,b,c,e){var g=1;if(b.length)for(var d=0;d<b.length;++d)g*=b[d];else g=0;c=e||z.allocType(c,g);switch(b.length){case 0:break;case 1:e=b[0];for(b=0;b<e;++b)c[b]=a[b];break;case 2:e=b[0];b=b[1];for(d=g=0;d<e;++d)for(var r=a[d],n=0;n<b;++n)c[g++]=r[n];break;case 3:gb(a,b[0],b[1],b[2],c,0);break;default:hb(a,b,0,c,0)}return c}},Ga={"[object Int8Array]":5120,"[object Int16Array]":5122,"[object Int32Array]":5124,"[object Uint8Array]":5121,"[object Uint8ClampedArray]":5121,"[object Uint16Array]":5123,
"[object Uint32Array]":5125,"[object Float32Array]":5126,"[object Float64Array]":5121,"[object ArrayBuffer]":5121},Ha={int8:5120,int16:5122,int32:5124,uint8:5121,uint16:5123,uint32:5125,"float":5126,float32:5126},lb={dynamic:35048,stream:35040,"static":35044},Qa=Ma.flatten,kb=Ma.shape,ha=[];ha[5120]=1;ha[5122]=2;ha[5124]=4;ha[5121]=1;ha[5123]=2;ha[5125]=4;ha[5126]=4;var Sa={points:0,point:0,lines:1,line:1,triangles:4,triangle:4,"line loop":2,"line strip":3,"triangle strip":5,"triangle fan":6},ob=
new Float32Array(1),Jb=new Uint32Array(ob.buffer),Nb=[9984,9986,9985,9987],La=[0,6409,6410,6407,6408],S={};S[6409]=S[6406]=S[6402]=1;S[34041]=S[6410]=2;S[6407]=S[35904]=3;S[6408]=S[35906]=4;var Va=ka("HTMLCanvasElement"),Wa=ka("OffscreenCanvas"),sb=ka("CanvasRenderingContext2D"),tb=ka("ImageBitmap"),ub=ka("HTMLImageElement"),vb=ka("HTMLVideoElement"),Kb=Object.keys(Ga).concat([Va,Wa,sb,tb,ub,vb]),Z=[];Z[5121]=1;Z[5126]=4;Z[36193]=2;Z[5123]=2;Z[5125]=4;var w=[];w[32854]=2;w[32855]=2;w[36194]=2;w[34041]=
4;w[33776]=.5;w[33777]=.5;w[33778]=1;w[33779]=1;w[35986]=.5;w[35987]=1;w[34798]=1;w[35840]=.5;w[35841]=.25;w[35842]=.5;w[35843]=.25;w[36196]=.5;var E=[];E[32854]=2;E[32855]=2;E[36194]=2;E[33189]=2;E[36168]=1;E[34041]=4;E[35907]=4;E[34836]=16;E[34842]=8;E[34843]=6;var Wb=function(a,b,c,e,g){function d(a){this.id=q++;this.refCount=1;this.renderbuffer=a;this.format=32854;this.height=this.width=0;g.profile&&(this.stats={size:0})}function r(b){var c=b.renderbuffer;a.bindRenderbuffer(36161,null);a.deleteRenderbuffer(c);
b.renderbuffer=null;b.refCount=0;delete t[b.id];e.renderbufferCount--}var n={rgba4:32854,rgb565:36194,"rgb5 a1":32855,depth:33189,stencil:36168,"depth stencil":34041};b.ext_srgb&&(n.srgba=35907);b.ext_color_buffer_half_float&&(n.rgba16f=34842,n.rgb16f=34843);b.webgl_color_buffer_float&&(n.rgba32f=34836);var u=[];Object.keys(n).forEach(function(a){u[n[a]]=a});var q=0,t={};d.prototype.decRef=function(){0>=--this.refCount&&r(this)};g.profile&&(e.getTotalRenderbufferSize=function(){var a=0;Object.keys(t).forEach(function(b){a+=
t[b].stats.size});return a});return{create:function(b,c){function k(b,c){var d=0,e=0,m=32854;"object"===typeof b&&b?("shape"in b?(e=b.shape,d=e[0]|0,e=e[1]|0):("radius"in b&&(d=e=b.radius|0),"width"in b&&(d=b.width|0),"height"in b&&(e=b.height|0)),"format"in b&&(m=n[b.format])):"number"===typeof b?(d=b|0,e="number"===typeof c?c|0:d):b||(d=e=1);if(d!==h.width||e!==h.height||m!==h.format)return k.width=h.width=d,k.height=h.height=e,h.format=m,a.bindRenderbuffer(36161,h.renderbuffer),a.renderbufferStorage(36161,
m,d,e),g.profile&&(h.stats.size=E[h.format]*h.width*h.height),k.format=u[h.format],k}var h=new d(a.createRenderbuffer());t[h.id]=h;e.renderbufferCount++;k(b,c);k.resize=function(b,c){var d=b|0,e=c|0||d;if(d===h.width&&e===h.height)return k;k.width=h.width=d;k.height=h.height=e;a.bindRenderbuffer(36161,h.renderbuffer);a.renderbufferStorage(36161,h.format,d,e);g.profile&&(h.stats.size=E[h.format]*h.width*h.height);return k};k._reglType="renderbuffer";k._renderbuffer=h;g.profile&&(k.stats=h.stats);k.destroy=
function(){h.decRef()};return k},clear:function(){J(t).forEach(r)},restore:function(){J(t).forEach(function(b){b.renderbuffer=a.createRenderbuffer();a.bindRenderbuffer(36161,b.renderbuffer);a.renderbufferStorage(36161,b.format,b.width,b.height)});a.bindRenderbuffer(36161,null)}}},Xa=[];Xa[6408]=4;Xa[6407]=3;var Na=[];Na[5121]=1;Na[5126]=4;Na[36193]=2;var Ba=["x","y","z","w"],Ub="blend.func blend.equation stencil.func stencil.opFront stencil.opBack sample.coverage viewport scissor.box polygonOffset.offset".split(" "),
Ea={0:0,1:1,zero:0,one:1,"src color":768,"one minus src color":769,"src alpha":770,"one minus src alpha":771,"dst color":774,"one minus dst color":775,"dst alpha":772,"one minus dst alpha":773,"constant color":32769,"one minus constant color":32770,"constant alpha":32771,"one minus constant alpha":32772,"src alpha saturate":776},$a={never:512,less:513,"<":513,equal:514,"=":514,"==":514,"===":514,lequal:515,"<=":515,greater:516,">":516,notequal:517,"!=":517,"!==":517,gequal:518,">=":518,always:519},
Pa={0:0,zero:0,keep:7680,replace:7681,increment:7682,decrement:7683,"increment wrap":34055,"decrement wrap":34056,invert:5386},xb={cw:2304,ccw:2305},yb=new P(!1,!1,!1,function(){}),Xb=function(a,b){function c(){this.endQueryIndex=this.startQueryIndex=-1;this.sum=0;this.stats=null}function e(a,b,d){var e=r.pop()||new c;e.startQueryIndex=a;e.endQueryIndex=b;e.sum=0;e.stats=d;n.push(e)}if(!b.ext_disjoint_timer_query)return null;var g=[],d=[],r=[],n=[],u=[],q=[];return{beginQuery:function(a){var c=g.pop()||
b.ext_disjoint_timer_query.createQueryEXT();b.ext_disjoint_timer_query.beginQueryEXT(35007,c);d.push(c);e(d.length-1,d.length,a)},endQuery:function(){b.ext_disjoint_timer_query.endQueryEXT(35007)},pushScopeStats:e,update:function(){var a,c;a=d.length;if(0!==a){q.length=Math.max(q.length,a+1);u.length=Math.max(u.length,a+1);u[0]=0;var e=q[0]=0;for(c=a=0;c<d.length;++c){var k=d[c];b.ext_disjoint_timer_query.getQueryObjectEXT(k,34919)?(e+=b.ext_disjoint_timer_query.getQueryObjectEXT(k,34918),g.push(k)):
d[a++]=k;u[c+1]=e;q[c+1]=a}d.length=a;for(c=a=0;c<n.length;++c){var e=n[c],h=e.startQueryIndex,k=e.endQueryIndex;e.sum+=u[k]-u[h];h=q[h];k=q[k];k===h?(e.stats.gpuTime+=e.sum/1E6,r.push(e)):(e.startQueryIndex=h,e.endQueryIndex=k,n[a++]=e)}n.length=a}},getNumPendingQueries:function(){return d.length},clear:function(){g.push.apply(g,d);for(var a=0;a<g.length;a++)b.ext_disjoint_timer_query.deleteQueryEXT(g[a]);d.length=0;g.length=0},restore:function(){d.length=0;g.length=0}}};return function(a){function b(){if(0===
B.length)w&&w.update(),aa=null;else{aa=ab.next(b);t();for(var a=B.length-1;0<=a;--a){var c=B[a];c&&c(A,null,0)}k.flush();w&&w.update()}}function c(){!aa&&0<B.length&&(aa=ab.next(b))}function e(){aa&&(ab.cancel(b),aa=null)}function g(a){a.preventDefault();e();V.forEach(function(a){a()})}function d(a){k.getError();f.restore();D.restore();R.restore();x.restore();N.restore();T.restore();J.restore();w&&w.restore();O.procs.refresh();c();X.forEach(function(a){a()})}function r(a){function b(a){var c={},d=
{};Object.keys(a).forEach(function(b){var e=a[b];ga.isDynamic(e)?d[b]=ga.unbox(e,b):c[b]=e});return{dynamic:d,"static":c}}function c(a){for(;m.length<a;)m.push(null);return m}var d=b(a.context||{}),e=b(a.uniforms||{}),f=b(a.attributes||{}),g=b(function(a){function b(a){if(a in c){var d=c[a];delete c[a];Object.keys(d).forEach(function(b){c[a+"."+b]=d[b]})}}var c=H({},a);delete c.uniforms;delete c.attributes;delete c.context;delete c.vao;"stencil"in c&&c.stencil.op&&(c.stencil.opBack=c.stencil.opFront=
c.stencil.op,delete c.stencil.op);b("blend");b("depth");b("cull");b("stencil");b("polygonOffset");b("scissor");b("sample");"vao"in a&&(c.vao=a.vao);return c}(a));a={gpuTime:0,cpuTime:0,count:0};var d=O.compile(g,f,e,d,a),h=d.draw,k=d.batch,l=d.scope,m=[];return H(function(a,b){var d;if("function"===typeof a)return l.call(this,null,a,0);if("function"===typeof b)if("number"===typeof a)for(d=0;d<a;++d)l.call(this,null,b,d);else if(Array.isArray(a))for(d=0;d<a.length;++d)l.call(this,a[d],b,d);else return l.call(this,
a,b,0);else if("number"===typeof a){if(0<a)return k.call(this,c(a|0),a|0)}else if(Array.isArray(a)){if(a.length)return k.call(this,a,a.length)}else return h.call(this,a)},{stats:a})}function n(a,b){var c=0;O.procs.poll();var d=b.color;d&&(k.clearColor(+d[0]||0,+d[1]||0,+d[2]||0,+d[3]||0),c|=16384);"depth"in b&&(k.clearDepth(+b.depth),c|=256);"stencil"in b&&(k.clearStencil(b.stencil|0),c|=1024);k.clear(c)}function u(a){B.push(a);c();return{cancel:function(){function b(){var a=zb(B,b);B[a]=B[B.length-
1];--B.length;0>=B.length&&e()}var c=zb(B,a);B[c]=b}}}function q(){var a=S.viewport,b=S.scissor_box;a[0]=a[1]=b[0]=b[1]=0;A.viewportWidth=A.framebufferWidth=A.drawingBufferWidth=a[2]=b[2]=k.drawingBufferWidth;A.viewportHeight=A.framebufferHeight=A.drawingBufferHeight=a[3]=b[3]=k.drawingBufferHeight}function t(){A.tick+=1;A.time=z();q();O.procs.poll()}function m(){q();O.procs.refresh();w&&w.update()}function z(){return(Ab()-C)/1E3}a=Fb(a);if(!a)return null;var k=a.gl,h=k.getContextAttributes();k.isContextLost();
var f=Gb(k,a);if(!f)return null;var p=Cb(),l={vaoCount:0,bufferCount:0,elementsCount:0,framebufferCount:0,shaderCount:0,textureCount:0,cubeCount:0,renderbufferCount:0,maxTextureUnits:0},v=f.extensions,w=Xb(k,v),C=Ab(),E=k.drawingBufferWidth,L=k.drawingBufferHeight,A={tick:0,time:0,viewportWidth:E,viewportHeight:L,framebufferWidth:E,framebufferHeight:L,drawingBufferWidth:E,drawingBufferHeight:L,pixelRatio:a.pixelRatio},G=Vb(k,v),R=Hb(k,l,a,function(a){return J.destroyBuffer(a)}),J=Pb(k,v,G,l,R),P=
Ib(k,v,R,l),D=Qb(k,p,l,a),x=Lb(k,v,G,function(){O.procs.poll()},A,l,a),N=Wb(k,v,G,l,a),T=Ob(k,v,G,x,N,l),O=Tb(k,p,v,G,R,P,x,T,{},J,D,{elements:null,primitive:4,count:-1,offset:0,instances:-1},A,w,a),p=Rb(k,T,O.procs.poll,A,h,v,G),S=O.next,K=k.canvas,B=[],V=[],X=[],Y=[a.onDestroy],aa=null;K&&(K.addEventListener("webglcontextlost",g,!1),K.addEventListener("webglcontextrestored",d,!1));var Z=T.setFBO=r({framebuffer:ga.define.call(null,1,"framebuffer")});m();h=H(r,{clear:function(a){if("framebuffer"in
a)if(a.framebuffer&&"framebufferCube"===a.framebuffer_reglType)for(var b=0;6>b;++b)Z(H({framebuffer:a.framebuffer.faces[b]},a),n);else Z(a,n);else n(null,a)},prop:ga.define.bind(null,1),context:ga.define.bind(null,2),"this":ga.define.bind(null,3),draw:r({}),buffer:function(a){return R.create(a,34962,!1,!1)},elements:function(a){return P.create(a,!1)},texture:x.create2D,cube:x.createCube,renderbuffer:N.create,framebuffer:T.create,framebufferCube:T.createCube,vao:J.createVAO,attributes:h,frame:u,on:function(a,
b){var c;switch(a){case "frame":return u(b);case "lost":c=V;break;case "restore":c=X;break;case "destroy":c=Y}c.push(b);return{cancel:function(){for(var a=0;a<c.length;++a)if(c[a]===b){c[a]=c[c.length-1];c.pop();break}}}},limits:G,hasExtension:function(a){return 0<=G.extensions.indexOf(a.toLowerCase())},read:p,destroy:function(){B.length=0;e();K&&(K.removeEventListener("webglcontextlost",g),K.removeEventListener("webglcontextrestored",d));D.clear();T.clear();N.clear();x.clear();P.clear();R.clear();
J.clear();w&&w.clear();Y.forEach(function(a){a()})},_gl:k,_refresh:m,poll:function(){t();w&&w.update()},now:z,stats:l});a.onDone(null,h);return h}});

},{}],25:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],26:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],27:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1])(1)
});
