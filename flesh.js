

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

src(s0)
.scale(()=>a.fft[0]*9+.5)
.contrast(1.3)
// .saturate(0.2)
.saturate(()=>a.fft[3]* 9 + 0.2)
.modulate(voronoi(3).modulate(noise(5)))
.rotate(({time})=> 6+time*.1)
.modulate(o0,.02)
// .modulate(voronoi((43),()=>mouse.y * 0.00000005+0))

.blend(o0)
.scale(1.02, 1.02)
.modulate(o1)
// .scrollX([-0.5,-0.2,0.3,-0.1,-0.1].smooth(0.1).fast(0.3))
// .scrollY([0.25,-0.2,0.3,-0.1,0.2].smooth(0.9).fast(0.15))
  // .rotate(Math.PI/2)
// .modulateRepeat(voronoi(60,-0.015,0.3))



.out(o0)





solid(0)
  .add
  (
    voronoi(1, 0, 0)
    .color(0, 0, 0)
  )
  .add(
    noise(3)
  .rotate(04, 0.4)
  .color(1,3,4)
  .color( ()=>Math.sin(time)*0.002+.28,0.2,0.2 ))
  // .modulateRotate( noise(()=>a.fft[3]*.03+.2, 0.2).color(6), 6))
  .scale(.99,.99)
  // .modulateRotate( osc(5, 0.2).color(6), 6)

  // .modulateScale( noise(4, ()=>a.fft[0]*4+.02), 4))

  // .modulateScale( noise(4, 0.1), 4))

.blend(o1)
.blend(o1)
.blend(o1)

.out(o1)



render(o0)








}
