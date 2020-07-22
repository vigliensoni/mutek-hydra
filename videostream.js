// const Hydra = require('hydra-synth')

// var myElement = document.createElement('img'); // <img />
// myElement.src = 'PabloPIMP.jpeg';    // <img src=" " />



const body = document.body;

window.document.body.addEventListener("mousemove", ()=>openFullscreen(body) )

function openFullscreen(elem) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) { /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE/Edge */
    elem.msRequestFullscreen();
  }
}

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
  // imagine = new Image()
  // imagine.onload = () => s0.init({src:imagine, dynamic:false})
  // imagine.crossOrigin = "anonymous"
  // // imagine.src = "https://media.hitparade.ch/cover/big/zion_lennox_x_anuel_aa_x_haze-guayo_s.jpg"
  // imagine.src = "./guayo.jpg"


  video = document.createElement("video")
  // video.src = "https://www.youtube.com/watch?v=B4Kn3djJMCE"+"&origin=https://vigliensoni.github.io"
  // video.src = "https://i.imgur.com/3C088RY.mp4"
  video.src = "https://raw.githubusercontent.com/ojack/hydra-examples/master/assets/jelly.webm"
  video.autoplay = true
  video.muted = true
  video.loop = true
  video.crossOrigin = "anonymous"
  
  
  
  video.play().then(()=>s0.init({src:video, dynamic:true}))  
  

  src(s0)
  // .scale(()=> a.fft[0]*4.5 )
  // .modulate(osc(() => mouse.y * 1, 1.9, 0.08), 0.01, 0.1)
  // .rotate(({time})=>(time%360)/2)
  // .color([1, 0, 0])
  .colorama( ({time}) => Math.sin(time/5) )
  .out(o0)

// render(o1)

// imagine.src = images.next()

// video.src = videos.random()

// video.src = videos.next()
// video.play().then(()=>s0.init({src:video, dynamic:true}))


}

