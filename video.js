// const Hydra = require('hydra-synth')

// var myElement = document.createElement('img'); // <img />
// myElement.src = 'PabloPIMP.jpeg';    // <img src=" " />


document.body.requestFullscreen()


window.onload = function () {
  const hydra = new Hydra()

  // shape(200,0.5,1.5)
  // .scale(() => a.fft[0]*1.25 + 0.05)
  // .color([0.5,2].smooth(1),0.3,0)
  // .repeat(2,2)
  // .modulateScale(osc(3,0.5),-0.6)
  // .add(o0,0.5)
  // .scale(0.9) 
  // .out()


  // MEDIA READERS MEDIA READERS MEDIA READERS MEDIA READERS
  imagine = new Image()
  imagine.onload = () => s0.init({src:imagine, dynamic:false})
  imagine.crossOrigin = "anonymous"
  // imagine.src = "https://media.hitparade.ch/cover/big/zion_lennox_x_anuel_aa_x_haze-guayo_s.jpg"
  imagine.src = "./guayo.jpg"


  // video = document.createElement("video")
  // video.autoplay = true
  // video.crossOrigin = "anonymous"
  // video.muted = true
  // video.src = "https://i.imgur.com/3C088RY.mp4"
  // video.loop = true
  // video.play().then(()=>s0.init({src:video, dynamic:true}))  


  src(s0)
  .scale(()=> a.fft[0]*1.5 )
  .modulate(osc(() => mouse.y * 1, 1.9, 0.08), 0.01, 0.1)
  .rotate(() => a.fft[3] * 4 - 1)
  // .color([1, 0, 0])
  .colorama( ({time}) => Math.sin(time/5) )
  .out(o0)

// render(o1)

// imagine.src = images.next()

// video.src = videos.random()

// video.src = videos.next()
// video.play().then(()=>s0.init({src:video, dynamic:true}))


}

