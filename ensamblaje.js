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
  video.src = "./fotos/videos/explosiones_slower.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))



  osc(({time})=>5.0+2*Math.sin(time*.03),.02)
  	.modulateRepeat(o1)
  	.modulateScale(osc(2,4))
  	.blend(o0)
  .out(o0)



  osc(({time})=>4+3*Math.sin(time*.05),.02)
  	// .modulateRepeat(o0)
    .scale(  () => a.fft[1]*2 )

  	 .rotate (({time})=> time*.01)
    .rotate (() => mouse.y *.0008 + 5)
  	.blend(o1,.25)
  .out(o1)


  osc(3,.7,() => mouse.x *.008 )
  	.kaleid()
    .mask(o0)
  	// .thresh()
  .out(o2)





src(s0)
  .scale(1.7)
  .scrollX(({time})=>4+3*Math.sin(time*.2))
  .saturate(0.2)
  .contrast(2)

  .mult(o2,.9)
  .modulate(s0, .08)

.out(o3)

  render()

  speed=.15




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


}
