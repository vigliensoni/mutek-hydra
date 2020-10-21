// Hydra
const hydra = new Hydra()
a.show();
a.setBins(4);
a.setSmooth(.96)

// Video stuff
const video = document.createElement("video")
video.autoplay = true
video.crossOrigin = "anonymous"
video.loop = true
video.muted = false



function but1() {
  console.log('1')

    // const hydra = new Hydra()
  
    // a.show();
    // a.setBins(4);
    // a.setSmooth(.96)

    video.src = "./fotos/videos/e01-small.mp4"
    // playVideo()
    video.play().then( () => s0.init({src:video, dynamic:true}))    


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

function but2() {
  console.log('2 - bd08 - flesh')

  video.src = "./fotos/videos/bd08-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )    


  src(s0)
    .scale(()=>a.fft[0]*9+.5)
    .contrast(1.3)
    .saturate(()=>a.fft[3]* 9 + 0.2)
    .modulate(voronoi(3).modulate(noise(5)))
    .rotate(({time})=> 6+time*.1)
    .modulate(o0,.02)
    .blend(o0)
    .scale(1.02, 1.02)
    .modulate(o1)
    .out(o0)

  solid(0)
    .add
    (voronoi(1, 0, 0)
      .color(0, 0, 0))
    .add(noise(3)
    .rotate(04, 0.4)
    .color(1,3,4)
    .color( ()=>Math.sin(time)*0.002+.28,0.2,0.2 ))
    .scale(.99,.99)
    .blend(o1)
    .blend(o1)
    .blend(o1)
    .out(o1)

  render(o0)  
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

function but6() {
  console.log('6 - fall in sync')
  video.src = "./fotos/videos/reg-test-small.mp4"
  // playVideo()
  video.play().then( () => s0.init({src:video, dynamic:true}) )    

  src(s0)
    .saturate(0.15)
    .contrast(3)
    .add(src(o0)
          .scrollX([0.05,-0.05].fast(0.1).smooth(1))
          .scale([1,1].fast(0.3).smooth(1),[1.05,0.9,1].fast(0.29).smooth(1)),0.85)
          .blend(o0)
    .out(o0)

  osc(7)
    .posterize (() => (1 + mouse.x * 0.006)+1)
    .modulate(noise(()=>a.fft[3]*3+1.5))
    .out(o1)

  voronoi(()=>Math.sin(time*.01)*1.2+5, ()=>mouse.y * .0004+.05, 100)
    .scrollX(({time})=>Math.sin(time*.05)*-0.7-1)
    .scrollX(()=>a.fft[0]*-.3)
    .colorama(1)
    .diff(o1)
    .thresh()
    .out(o2)

  src(o1)
    .modulateRotate(o0)
    .modulate(o2,.1,1.3)
    .out(o3)

  render(o3)
  
}

function but7() {
  console.log('5')
}
function but8() {
  console.log('5')
}
function but9() {
  console.log('5')
}




