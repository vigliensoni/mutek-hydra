// AGREGANDO FOTO



window.onload = function () {
  const hydra = new Hydra()

s1.initCam(s1)

a.show();
a.setBins(4);
a.setSmooth(.96)
// a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/glaciar_perito_moreno.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))

src(s0)

  .rotate  (.1, ()=> Math.sin(time * 0.001))

.scale(1.4)

// .blend(o1,.5)
.scale(  () => a.fft[3]*3 )
.diff(o1,0.3)
// .modulateScale(o0,.4)

.modulate(s0,.025)
.blend(o0)
.modulate(o2,.03)

  .out(o0)





gradient(0.125)

  .pixelate([5,2,10],[15,8])
  .scale(0.15)
  .modulate(noise(1,0.25))
  .scrollX(0, ({time}) => Math.sin(time*0.05)*0.05 )
  .scrollY(0, ({time}) => Math.sin(time*0.01)*-0.07 )

  .out(o1)



  shape(3)
  .scale(.7)
  .repeat(8,3)
  // .scale(1, ()=> 0.7 + a.fft[3])
  .modulateScale(osc(8).rotate(Math.sin(time)),.5)
   .scale(  () => a.fft[0]*8)
   .modulateRotate(osc(20, 0).thresh(0.1, 0.84), () => 0.1 + mouse.x * 0.002)
   .modulate(o2,.001)
   .blend(o2)

    .out(o2)



render(o0)


}
