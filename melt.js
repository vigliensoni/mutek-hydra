

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
  .contrast(()=>mouse.x * .0008+.6 )
  .rotate(()=>a.fft[2]*4)
  .scale(()=>a.fft[1]*.24+1)
  // .kaleid(2)
  // .modulate(o0, 0.01)
  .rotate(({time}) => 5.0+2*Math.sin(time*.03),.01)
  // .scale(({time})=>Math.sin(time*1)*0.5+1)
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
