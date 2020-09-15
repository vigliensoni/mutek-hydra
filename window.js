

window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth(.96)
a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/cross_section.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))




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
  .modulateRotate( osc(()=>a.fft[3]*3+5, 0.2).color(6), 6)
  // .modulateRotate( osc(5, 0.2).color(6), 6)

  .modulateScale( noise(4, ()=>a.fft[0]*4+.02), 4))

  // .modulateScale( noise(4, 0.1), 4))


.blend(o1)
.blend(o1)
.blend(o1)


.out(o1)


 // voronoi(8,1)
  // noise(()=> a.fft[2]*3+120,0)
 voronoi(()=>mouse.x * .5,()=> a.fft[2]*3+90,0)


.mult(osc(3,()=> a.fft[2]*3+0.1,()=>Math.sin(time/15)*.3+.08).saturate(4).kaleid(200))
.modulate(o1,0.5)
.add(o1,0.8)
.scrollY(-0.1)
.scale(0.99)
.modulate(o1)
.modulate(noise(()=>Math.sin(time)*.07+.2),()=>Math.sin(time)*.02+.1)

// .modulate(o0)

//.modulate(voronoi(8,1),0.008)
// .luma(0.3)
.blend(o2)
.blend(o2).blend(o2)

.scrollX(()=>mouse.x * .0000005,.00001)
.scrollY(()=>mouse.y * .00000051,.000001)


.out(o2)



render(o2)





}
