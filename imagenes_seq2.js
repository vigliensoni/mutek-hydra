window.onload = function () {
  const hydra = new Hydra()
  const photoPath = ['fotos/Interiores_pintura/1File.jpg', 'fotos/Interiores_pintura/2File.jpg'
  ,'fotos/Interiores_pintura/3File.jpg','fotos/Interiores_pintura/4File.jpg','fotos/Interiores_pintura/5File.jpg']
  const n = photoPath.length


  let image0 = new Image()

  image0.onload = () => s0.init({src:image0, dynamic:false})
  image0.crossOrigin = "anonymous"

  a.show();
  a.setBins(4);
  a.setSmooth(.96)
  // a.hide()


  s1.initCam()

src(s0)
.scale(.5, ()=> 0.5 + a.fft[2], ()=> 0.5 + a.fft[3])


.mask(o1,.2)
.blend(src(o0)
.scale(1.8))
.modulateScale(osc(2).modulateRotate(o0,.74))
// .diff(src(o0).rotate([-.012,.01,-.002,0]).scrollY(0,[-1/199800,0].fast(0.7)))

  // blend(o0, .75).scrollX(({time})=>time*.01).scale(2).repeat(2.5).rotate(1.047)
.out()




shape(24)
.repeat(3,4)
// .scale(1, ()=> 0.7 + a.fft[3])
.modulateScale(osc(8).rotate(Math.sin(time)),.5)
 .rotate(0.92, 0.3)
 .modulateRotate(osc(20, 0).thresh(0.1, 0.84), () => 0.1 + mouse.x * 0.002)


.out(o1)









  let i = 0
  setInterval(changephoto, 3000);

  function changephoto() {
      image0.src = photoPath[i%n];
      i++
    }

}
