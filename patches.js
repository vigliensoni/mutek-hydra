// Video stuff
const video = document.createElement("video")
video.autoplay = true
video.crossOrigin = "anonymous"
video.loop = true
video.muted = false
// video.src = "./fotos/videos/e01-small.mp4"

const playVideo = () => {
  video.play().then( () => s0.init({src:video, dynamic:true}))
}



function but1() {
  console.log('1')
  video.src = "./fotos/videos/e01-small.mp4"
  playVideo()

  window.onload = function () {
    const hydra = new Hydra()
  
    a.show();
    a.setBins(4);
    a.setSmooth(.96)
  
    solid(0)
    .add(
      osc(1, 0, 0)
      .color(0, 0, 0)
      )
    .add(
      shape(3)
      .rotate(04, 0.4)
      .color(1,3,4)
      .color( ()=>Math.sin(time)*0.002+.28,0.2,0.2 )
      .modulateRotate( osc(()=>a.fft[3]*3+5, 0.2).color(6), 6)
      .modulateScale( noise(4, ()=>a.fft[0]*4+.02), 4)
      )
  
    .blend(o1)
    .blend(o1)
    .blend(o1)
  
    .out(o1)
  
    voronoi(()=>mouse.x * .5,()=> a.fft[2]*3+90,0)
    .mult(osc(3,()=> a.fft[2]*3+0.1,()=>Math.sin(time/15)*.3+.08).saturate(4).kaleid(200))
    .modulate(o1,0.5)
    .add(o1,0.8)
    .scrollY(-0.1)
    .scale(0.99)
    .modulate(o1)
    .modulate(noise(()=>Math.sin(time)*.07+.2),()=>Math.sin(time)*.02+.1)
  
    .blend(o2)
    .blend(o2).blend(o2)
  
    .scrollX(()=>mouse.x * .0000005,.00001)
    .scrollY(()=>mouse.y * .00000051,.000001)
  
    .out(o2)
  
    render(o2)
  
  }
}

function but2() {
  console.log('2')
  video.src = "./fotos/videos/reg-test-small.mp4"
  playVideo()

  window.onload = function () {
    const hydra = new Hydra()
  
    a.show();
    a.setBins(4);
    a.setSmooth(.96)
  
    src(s0)
      .rotate (.1,() => Math.sin(time * 0.00008))
      .scale(1.4)
      .scale(  () => a.fft[3]*1.2+.5 )
      .diff(o1,0.3)
      .modulate(s0,.025)
      .blend(o0)
      .modulate(o2,.03)
      .out(o0)
  
    src(s0)
  
    gradient(0.125,.2)
      .pixelate([5,2,10],[15,8])
      .scale(0.15)
      .modulate(noise(  () => a.fft[0]*.3+.2 ),1,0.25)
      .scrollX(0, ({time}) => Math.sin(time*0.05)*0.05 )
      .scrollY(0, ({time}) => Math.sin(time*0.01)*-0.07 )
      .out(o1)
  
  
  
    shape(3)
      .scale(()=>mouse.y * 0.0008 + .1 )
      .repeat(8,3)
      .modulateScale(osc(8).rotate(Math.sin(time)),.5)
      .scale(  () => a.fft[2]*8)
      .modulateRotate(osc(20, 0).thresh(0.1, 0.84), () => 0.1 + mouse.x * 0.002)
      .modulate(o2,.001)
      .blend(o2)
      .out(o2)
  
  
  
    render(o0)
  
  }
  
}

function but3() {
  console.log('3')
}

function but4() {
  console.log('4')
}

function but5() {
  console.log('5')
}









