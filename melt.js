

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
  video.src = "./fotos/videos/lava01_trimlite.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))



src(s0)
.saturate(.4)
// .modulateScale(o0,0.02)
.contrast(()=>mouse.x * .00028+.6 )
 .rotate(()=>a.fft[2]*4)
.scale(()=>a.fft[1]*.24+1.4)
// .kaleid(2)
// .modulate(o0, 0.01)
.rotate(({time})=>5.0+2*Math.sin(time*.03),.01)
.modulate((o2), ()=> a.ftt[0]*1.2)

.blend(o0)
// .(.2)


.out(o0)




// osc(4,3,9)
//   .kaleid (3)
//   .mask(shape(5,2,5))
//   .modulateRotate(shape(3,0.5,2))
//   .modulateRotate(shape(7,3,0.9))
//   .modulateRotate(shape(4,05,0.8))
//   .scale(0.2)
//   .add(shape(5,0.1,1).color(0.2,3,4,0.3))
//   .rotate(()=>time)
//   .kaleid (6)
//   .kaleid (1)
//   .out(o1)



voronoi(2,0.3,0.2).shift(0.5)
.modulatePixelate(voronoi(4,0.2),32,2)
.scale(()=>1+(Math.sin(time*12.5)*0.05),()=>mouse.y * 0.002)
.out(o1)



osc(4, ()=> a.fft[0]*.2-.1, 1)
.scrollY( ()=>0.5 + mouse.y * 0.0014,.6,1)

// .repeat( ()=>a.fft[0]*2+1, ()=>a.fft[1]*2+1)
//        // .layer(src(o2).mask(shape(4, 0.4, 0)))
//        .scrollX([0.05, -0.05])
//        .scrollY(0.05)

.out(o2)







src(o0)

.mult(o2,.8)
.modulateRotate(o0,()=>a.fft[1]*.1+1)
.invert()
.modulateScrollY(o1)

.out(o3)




render(o3)

}



//
// osc(({time})=>5.0+2*Math.sin(time*.03),.02,20)
//
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
