

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
  video.src = "./fotos/videos/cross_section.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))



// src(s0)
// .saturate(0)
// // .brightness(.16)
// .rotate(()=>a.fft[1]*1.2, .01)
// .contrast(3)
// .invert()
// .out(o0)




solid(0)
  .add
  (
    osc(1, 0, 0)
    .color(0, 0, 0)
  )
  .add(
    shape(3)
  .rotate(04, 0.4)
  .color(1,3,4)
  .color( ()=>Math.sin(time)*0.002+.28,0.2,0.2 )
  .modulateRotate( osc(()=>a.fft[2]*3+5, 0.2).color(6), 6)
  // .modulateRotate( osc(5, 0.2).color(6), 6)

  .modulateScale( noise(4, ()=>a.fft[0]*0.3+.02), 4))

  // .modulateScale( noise(4, 0.1), 4))


.blend(o1)
.blend(o1)
.blend(o1)


.out(o1)


// voronoi(8,1)
  noise(()=> a.fft[2]*3+120,0)
// voronoi(()=> a.fft[0]*1.2+2, 1)

.mult(osc(10,0.1,()=>Math.sin(time)*.3+.14).saturate(3).kaleid(200))
.modulate(o1,0.5)
.add(o1,0.8)
.scrollY(-0.1)
.scale(0.99)
.modulate(o1)

// .modulate(o0)

// .modulate(voronoi(8,1),0.008)
// .luma(0.3)
.blend(o2)
.blend(o2).blend(o2)

.scrollX(()=>mouse.x * .0000005,.00001)
.scrollY(()=>mouse.y * .00000051,.000001)


.out(o2)



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
