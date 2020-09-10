

window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth(.96)
// a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/ripples_01slow.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))



src(s0)
.saturate(0.15)

.contrast(3)
.add(
      src(o0)
//   .shift(0.001,0.01,0.001)
      .scrollX([0.05,-0.05].fast(0.1).smooth(1))
      .scale([1.05,0.9].fast(0.3).smooth(1),[1.05,0.9,1].fast(0.29).smooth(1))
      ,0.85)
      .blend(o0)
.out(o0)



osc(7)
.posterize (() => 0.1 + mouse.x * 0.006) 


.modulate(noise(()=>a.fft[3]*3+1.5))
.out(o1)

voronoi(5, ()=>mouse.y * .0004+.05, 100)
 .scrollX(({time})=>Math.sin(time*.05)*-0.7-1)
 .scrollX(()=>a.fft[0]*-.3)
 .colorama(1)
.diff(o1)
.thresh()
.out(o2)





src(o1)
// .modulate(o0)
// .mult(o1)
 // .diff(gradient(.01))
.modulateRotate(o0)
.modulate(o2)

.out(o3)

render()



}




// osc(4, ()=> a.fft[0]*.2-.1, 1)
// .scrollY( ()=>0.5 + mouse.y * 0.0014,.6,1)
// .repeat( ()=>a.fft[0]*2+1, ()=>a.fft[1]*2+1)
// .modulateRotate(o0,()=>a.fft[1]*.1+1)

// osc(({time})=>5.0+2*Math.sin(time*.03),.02,20)
// shape(()=>Math.sin(time)+1.2*3, .13,.01)
//   .repeat(5,3, ()=>a.fft[0]*2, ()=>a.fft[1]*2)
//   .scrollY(.5,0.1)



// OLIVIA'S TUBE
//
// src(s0)
// .blend(o0, 0.99)
// .scale(1.01)
// .out(o0)




// OLIVIA'S FEEDBACK

// osc(10, 0.1, 0.8)
//   .rotate(0, 0.1)
//   .kaleid()
//   .color(-1, 1)
// .out(o0)
//
//
//
// src(s0)
//   .color(-1, Math.random()*2, 1)
//   .colorama()
// .out(o1)
//
//
// src(o1)
//        .layer(src(o1).mask(shape(4, 0.4, 0)))
//        .scrollX([0.005, -0.005])
//        .scrollY(0.005)
// .out(o2)
//
//      render(o1)
