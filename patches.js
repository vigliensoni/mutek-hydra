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


let muted = false

function mute(){
  if ( muted == false ) {
    console.log('I will mute it')
    muted = true
    video.muted = muted
  }  
  else {
    console.log('I will unmute it')
    muted = false
    video.muted = muted
  }
}

function but1() {
  console.log('1 - e01 - window')

  video.src = "./fotos/videos/e01-small.mp4"
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
  console.log('3 - bd07 - salt')

  video.src = "./fotos/videos/bd07-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )    

  src(s0)
  .saturate(.4)
  .contrast(1.3)
  .rotate(()=>a.fft[2]*2)
  .scale(()=>a.fft[1]*.1+1)
  .rotate(({time})=>5.0+2*Math.sin(time*.03),.01)
  .modulate((o2), ()=> a.fft[0]*2)
  .blend(o0)
  .out(o0)

  shape(99,.15,.5).color(0,1,2)  
  .diff( shape(5,.5,0).scrollX(.05).scale( () => a.fft[3]*2+.8).rotate( () => a.fft[3]*4+4).color (() =>  .1 + mouse.x * 0.0005,0 + mouse.x * 0.0005),.5 + mouse.x * 0.0005).color(.1,.2,.5)
  .diff( shape(3,.4,.002).scrollX(.10).scale( () => a.fft[1]*-2,.8).rotate( ()=> a.fft[1]*-1.2-2).rotate(() => Math.sin(time)+1*-2).color(.1,0,.5) )
  .diff( shape(5,.3,.002).scrollX(.15).scale( () => a.fft[0]*2+.8).rotate( ()=> a.fft[3]*8+1).rotate(() => Math.sin(time)+3*2).color(.1,0.1,.5) )
  .diff( shape(5,.2,.002).scrollX(.20).scale( () => a.fft[3]*-2+1.8).rotate( ()=>a.fft[3]*-4-4).rotate(() => Math.sin(time)-1*-2).color(.3,0,.3) )
  .diff( shape(6,.1,.002).scrollX(.25).rotate( ()=>time/50 ).color(.1,0,.5) )
  
  .modulateScale(
    shape(3,.5,0).scrollX(.05).rotate( ()=>time/10 ), ()=>(Math.sin(time/3)*.2)+.2 )
  .scale(0.6, () => (1.05 + 0.1 * Math.sin(0.05*time)))
  .scale(()=> 0.8 + mouse.y * 0.0014,.6,1)
  .modulate(o2,.1)
  .mult(gradient(({time})=>0.2+.2*Math.sin(time*.03),({time})=>0.05+1*Math.sin(time*.01),({time})=>0.3+2*Math.sin(time*.05)))
  .out(o2)
  
  src(o0)
  .mult(o2,.8)
  .modulateRotate(o0,.01)
  .invert()
  .out(o3)
  
  render(o3)

}

function but4() {
  console.log('4 - e02 - mass')

  video.src = "./fotos/videos/e02-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )      

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

function but5() {
  console.log('5 - clastic - melt')

  video.src = "./fotos/videos/clastic-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )    

  src(s0)
  .saturate(.4)
  .contrast(()=>mouse.x * .0008+.6 )
  .rotate(()=>a.fft[2]*4)
  .scale(()=>a.fft[1]*.24+1)
  .rotate(({time}) => 5.0+2*Math.sin(time*.03),.01)
  .modulate((o2), () => a.fft[0]*1.2)
  .blend(o0)
  .out(o0)

  voronoi(2,0.3,0.2).shift(0.5)
  .modulatePixelate(voronoi(4,0.2),32,2)
  .scale(()=>1+(Math.sin(time*12.5)*0.05),()=>mouse.y * 0.002)
  .out(o1)

  osc(4, ()=> a.fft[0]*.2-.1, 1)
  .scrollY( ()=>0.5 + mouse.y * 0.0014,.6,1)
  .out(o2)

  src(o0)
  .mult(o2,.8)
  .modulateRotate(o0,()=>a.fft[1]*.1+1)
  .invert()
  .modulateScrollY(o1)
  .out(o3)

  render(o3)

}

function but6() {
  console.log('6 - fall in sync')

  video.src = "./fotos/videos/fall-small.mp4"
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
  console.log('7 - telematic - copper')

  video.src = "./fotos/videos/telematic-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )    

  src(s0)
  .scale(()=> a.fft[2]*.2+1)
  .color(()=>Math.sin(time*0.03),()=>Math.sin(time*0.17),()=>Math.sin(time*0.07))
  .rotate(()=>mouse.x*.0003+.000001,Math.sin(time) )
  .color(()=>mouse.y * 0.001,()=>mouse.y * 0.0008)
  .out(o0)
  
  src(o0)
  .diff(src(o3)
  .scrollY(0, [-.0001, 0.1].fast(0.004)))
  .brightness([-0.029, -.17].smooth().fast(0.21))
  .out(o3)
  
  render(o3)  

}


function but8() {
  console.log('8 - bd01 - asociaciones')

  video.src = "./fotos/videos/bd01-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )      
  
  osc(3,()=> a.fft[4]*.03 )
  .rotate(1.4,.2)
  .add(osc(3,.2))
  .out(o0)

  osc(0.50   ,1.25).mult(shape(12,20.09).rotate(()=>Math.random()*15))
    .diff(osc(()=>a.fft[0]*.1+03))
    .add(shape(3,22).rotate(()=>Math.random()*15).blend(gradient(1.6)))
    .modulate(noise(6)
              .modulate(noise(2).scrollY(()=> a.fft[2]*5,0.0625)))
    .blend(o0)
    .color(17,-90.5,0.75)
    .out(o1)

  src(s0)
  .scale(() =>  mouse.x * 0.0005+ .2)
  .rotate(()=>a.fft[3]*.01*Math.sin(time*.2)+.003)
  .modulate(o1)
  .rotate(()=> a.fft[0]*-.3+-.3 )
  .kaleid(()=>mouse.y*.001+1)
  .scrollX(({time})=>4+3*Math.sin(time*.002))
  .saturate(0.2)
  .contrast(2)
  .modulateRotate(noise(.2, ()=> a.fft[3]*-.02 ))
  .modulate(o2,.002)
  .blend(o3)
  .out(o2)

  gradient(.2,.03,2)
  .saturate(()=>a.fft[1]*3+0.2)
  .mask(o1)
  .out(o3)

render(o2)
  


}
function but9() {
  console.log('9 - bd02 - ensamblaje')

  video.src = "./fotos/videos/bd02-small.mp4"
  video.play().then( () => s0.init({src:video, dynamic:true}) )    

  osc(({time})=>5.0+2*Math.sin(time*.03),.02)
  .scrollX(() => a.fft[1]*4+5 )
  .modulateRepeat(o1)
  .modulateScale(osc(2,4))
  .blend(o0)
  .out(o0)

  osc(({time})=>4+3*Math.sin(time*.05),.02)
  .scale(  () => a.fft[0]*2.5+.5 )
  .scrollX(() => a.fft[3]*-.1+.2 )
  .rotate (({time})=> time*.01)
  .rotate (() => mouse.y *.008 + 1.5)
  .blend(o1,.25)
  .out(o1)

  osc(3,.7,() => mouse.x * 0.0028 )
  .kaleid()
  .mask(o0)
  .out(o2)

  src(s0)
  .scale(() => a.fft[1]*.8+1.3)
  .scrollX(({time})=>4+3*Math.sin(time*.2))
  .saturate(0.2)
  .contrast(2)
  .modulate(s0, .08)
  .mult(o2,()=>mouse.y*.001+.2)
  .modulate(s0, .03)
  .out(o3)


render(o3)

speed=.15  

}




