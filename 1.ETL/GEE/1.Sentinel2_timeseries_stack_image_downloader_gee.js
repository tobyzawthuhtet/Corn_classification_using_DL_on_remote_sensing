var vector_data = corn.merge(vegetation).merge(water).merge(non_corn);
print('vector data ',vector_data);

Map.setOptions('SATELLITE');
Map.centerObject(bago_aoi,12);


var startyear = 2020;
var endyear = 2021;

// Set date in ee date format
var start_date = ee.Date.fromYMD(startyear,10,15);
var end_date = ee.Date.fromYMD(endyear,4,30);


var s2Collection = ee.ImageCollection("COPERNICUS/S2_SR").filterDate(start_date,end_date).filterBounds(bago_aoi).filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE',10)).filter(ee.Filter.eq('SENSING_ORBIT_NUMBER',4))
.filter(ee.Filter.eq('SENSING_ORBIT_DIRECTION', 'DESCENDING'));
print('Size of S2 Collection',s2Collection.size());
print('Cloud free Sentinel 2 collection',s2Collection);
Map.addLayer(s2Collection.median().clip(bago_aoi),{},"Sentinel 2",0);


var maskcloud1 = function(image) {
var QA60 = image.select(['QA60']);
return image.updateMask(QA60.lt(1));
};

var s2Collection = s2Collection.map(maskcloud1);

// var months = ee.List.sequence(10,12);
// var months2 = ee.List.sequence(1,3);
// print('months',months);
// print('months 2',months2);

// var months= months.cat(months2);
// print('Final Months',months);

var fndvi = function(image){
  var ndvi = image.expression(
  "(NIR-RED)/(NIR+RED)",
  {
    RED: image.select('B4').multiply(0.0001),
    NIR : image.select('B5').multiply(0.0001)
    
  });// okay;
  var ndf = ndvi.rename('NDVI');
  var results = ndf.copyProperties(image, ['system:time_start']);
  return image.addBands(results);
};

var addEVI=function(image){
  var EVI = image.expression(
      '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
      {
      'NIR' : image.select('B8').divide(10000),
      'RED' : image.select('B4').divide(10000),
      'BLUE': image.select('B2').divide(10000)}).rename('EVI');
      return image.addBands(EVI);
};


var s2Collection=s2Collection.map(fndvi);
var s2Collection =s2Collection.map(addEVI);
print('Sentinel 2 Collection :',s2Collection);


var mndvi = s2Collection.select('EVI');
//print('Monthly NDVI stack :',mndvi);
//var mndvi = s2Collection.select('NDVI','EVI','B5','B4');
print('Monthly Data stack :',mndvi);

var opt_bands = mndvi.toList(ee.Number(mndvi.size()));
print("Optical Bands for Modelling",opt_bands.length().getInfo());



var training_image = ee.Image(opt_bands.get(0));
// var training_image_radar = ee.Image(radar_bands.get(0));




for (var i = 1; i < opt_bands.length().getInfo(); i++) {
  var myMap = ee.Image(opt_bands.get(i));
  training_image = training_image.addBands(myMap);
}



print('Training image optical',training_image);
//print('Training Image radar ',  training_image_radar);
Map.addLayer(training_image.clip(bago_aoi),{},'Training image');
//Map.addLayer(training_image_radar.clip(bago_aoi),{},'Training Image radar');
// // //============================================================


var training_image = training_image.toDouble();
var band_names= training_image.bandNames().getInfo();
print('Names of band ',band_names);


// // Make the training dataset.
// var training = training_image.sample({
//   region: bago_aoi,
//   scale: 30,
//   numPixels: 5000
// });

// // Instantiate the clusterer and train it.
// var clusterer = ee.Clusterer.wekaKMeans(6).train(training);

// // Cluster the input using the trained clusterer.
// var result = training_image.cluster(clusterer);

// // Display the clusters with random colors.
// Map.addLayer(result.clip(bago_aoi),imageVisParam5, 'clusters');

// // Supervised Classification Data

// var classifier = training_image.select(band_names).sampleRegions({
//   collection: vector_data,
//   properties:['croptype'],
//   scale:10
// });


// var trainClassifier = ee.Classifier.smileRandomForest(4).train({
//   features:classifier,
//   classProperty: 'croptype',
//   inputProperties: band_names
// });

// var landcoverClassified = training_image.select(band_names).classify(trainClassifier);

// Map.addLayer(landcoverClassified.randomVisualizer(),{},'Landcover Classified Randomforest Classes');

// Overlaying Corn Data
var corn_20_merge= corn_2020.eq(1);
var masked_corn_20_merge = corn_20_merge.updateMask(corn_20_merge);
Map.addLayer(masked_corn_20_merge,imageVisParam,'Corn 2020 Merge');

Export.image.toDrive({
  image: training_image.clip(bago_aoi),
  description: 'training_image',
  scale: 10,
  region: bago_aoi,
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  }
});