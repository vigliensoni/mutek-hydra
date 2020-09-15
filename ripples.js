

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
      .scale([1,1].fast(0.3).smooth(1),[1.05,0.9,1].fast(0.29).smooth(1))
      ,0.85)
      .blend(o0)

.out(o0)



osc(7)
.posterize (() => (1 + mouse.x * 0.006) +1)

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
// .modulate(o0)
// .mult(o1)
 // .diff(gradient(.01))
.modulateRotate(o0)
// .modulateScale(o0)

.modulate(o2,.1,1.3)

.out(o3)

render(o3)



}
