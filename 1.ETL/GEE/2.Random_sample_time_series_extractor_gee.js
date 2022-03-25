function bufferPoints(radius, bounds) {
  return function(pt) {
    pt = ee.Feature(pt);
    return bounds ? pt.buffer(radius).bounds() : pt.buffer(radius);
  };
}
function zonalStats(ic, fc, params) {
  // Initialize internal params dictionary.
  var _params = {
    reducer: ee.Reducer.mean(),
    scale: null,
    crs: null,
    bands: null,
    bandsRename: null,
    imgProps: null,
    imgPropsRename: null,
    datetimeName: 'datetime',
    datetimeFormat: 'YYYY-MM-dd HH:mm:ss'
  };

  // Replace initialized params with provided params.
  if (params) {
    for (var param in params) {
      _params[param] = params[param] || _params[param];
    }
  }

  // Set default parameters based on an image representative.
  var imgRep = ic.first();
  var nonSystemImgProps = ee.Feature(null)
    .copyProperties(imgRep).propertyNames();
  if (!_params.bands) _params.bands = imgRep.bandNames();
  if (!_params.bandsRename) _params.bandsRename = _params.bands;
  if (!_params.imgProps) _params.imgProps = nonSystemImgProps;
  if (!_params.imgPropsRename) _params.imgPropsRename = _params.imgProps;

  // Map the reduceRegions function over the image collection.
  var results = ic.map(function(img) {
    // Select bands (optionally rename), set a datetime & timestamp property.
    img = ee.Image(img.select(_params.bands, _params.bandsRename))
      .set(_params.datetimeName, img.date().format(_params.datetimeFormat))
      .set('timestamp', img.get('system:time_start'));

    // Define final image property dictionary to set in output features.
    var propsFrom = ee.List(_params.imgProps)
      .cat(ee.List([_params.datetimeName, 'timestamp']));
    var propsTo = ee.List(_params.imgPropsRename)
      .cat(ee.List([_params.datetimeName, 'timestamp']));
    var imgProps = img.toDictionary(propsFrom).rename(propsFrom, propsTo);

    // Subset points that intersect the given image.
    var fcSub = fc.filterBounds(img.geometry());

    // Reduce the image by regions.
    return img.reduceRegions({
      collection: fcSub,
      reducer: _params.reducer,
      scale: _params.scale,
      crs: _params.crs
    })
    // Add metadata to each feature.
    .map(function(f) {
      return f.set(imgProps);
    });
  }).flatten().filter(ee.Filter.notNull(_params.bandsRename));

  return results;
}

// Creating a dictionary for starting date and ending date to fill


var Start_period = ee.Date('2019-09-01');
var End_period = ee.Date(new Date().getTime());


ee.Dictionary({start: Start_period, end: End_period})
  .evaluate(renderSlider); 


function renderSlider(dates) {
  var slider = ui.DateSlider({
    start: dates.start.value, 
    end: dates.end.value, 
    period: 185, // Every 180 days
    onChange: renderDateRange
  });
  Map.add(slider);
  // return start,end
}


// Overlaying Corn Data
var corn_20_merge= corn_2020.eq(1);
var masked_corn_20_merge = corn_20_merge.updateMask(corn_20_merge);
print('Masked Corn 2020 Merge', masked_corn_20_merge);
Map.addLayer(masked_corn_20_merge,imageVisParam,'Corn 2020 Merge');


Map.setOptions('ROADMAP');
Map.centerObject(geometry,12);


// var startyear = 2019;
// var endyear = 2020;

// // Set date in ee date format
// var start_date = ee.Date.fromYMD(startyear,10,15);
// var end_date = ee.Date.fromYMD(endyear,1,30);

function renderDateRange(dateRange) {
  print(dateRange);
  var s2Collection =  ee.ImageCollection("COPERNICUS/S2_SR").filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE',10))
    .filterBounds(geometry)
    .filterDate(dateRange.start(), dateRange.end());
  print('first S2 Collection :',s2Collection);
  print('total number of images found :',s2Collection.size());
    
  var maskcloud1 = function(image) {
  var QA60 = image.select(['QA60']);
  return image.updateMask(QA60.lt(1));
  };

  s2Collection = s2Collection.map(maskcloud1);

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


var addLabel = function(image){
  var label = corn_2020.rename('Label');
  return image.addBands(label);
};



s2Collection=s2Collection.map(fndvi);
s2Collection =s2Collection.map(addEVI);
s2Collection= s2Collection.map(addLabel);


print('Sentinel 2 Collection preprocessed:',s2Collection);



var mndvi = s2Collection.select('NDVI','EVI','Label');
// print('Monthly Data stack :',mndvi);

//Creating random points over the place
var randomPoints = ee.FeatureCollection.randomPoints(
    {region: geometry, points: 1000, seed: 0, maxError: 1});


var params = {
  bands: ['NDVI', 'EVI','Label'],
  bandsRename: ['NDVI','EVI','Label']
};

// Extract zonal statistics per point per image.
var ptsTopoStats = zonalStats(mndvi, randomPoints, params);
// print(ptsTopoStats);
// print('Zonal stats',ptsTopoStats);

var Modis_pts = ptsTopoStats.select('datetime','EVI','NDVI','Label');
// print(Modis_pts);


// Map.addLayer(Modis_pts,{color:'red'},'Random Points');
var layer =ui.Map.Layer(s2Collection.mean().clip(geometry),imageVisParam2,'S2 Collection');
// Map.addLayer(s2Collection.mean().clip(geometry),imageVisParam2,'S2 Collection');

// Overlaying Corn Data
var corn_20_merge= corn_2020.eq(1);
var masked_corn_20_merge = corn_20_merge.updateMask(corn_20_merge);

var layer2 =ui.Map.Layer(masked_corn_20_merge,imageVisParam,'Corn 2020 Merge');

var layer3 = ui.Map.Layer(Modis_pts,{color:'red'},'Random Points');

var ClassChart = ui.Chart.image.series({
  imageCollection: s2Collection.select('EVI'),
  region: randomPoints,
  reducer: ee.Reducer.median(),
  scale: 100,
})
  .setOptions({
      title: 'Summer Corn Not Detected NDVI value',
      hAxis: {'title': 'Date'},
      vAxis: {'title': 'Area of NDVI Value '},
      lineWidth: 2
    });

//Set the postion of the chart and add it to the map    
ClassChart.style().set({
    position: 'bottom-right',
    width: '500px',
    height: '300px'
  });
  
print(ClassChart);


var chart2 =
    ui.Chart.image
        .seriesByRegion({
          imageCollection:s2Collection.select('EVI'),
          band: 'EVI',
          regions: randomPoints,
          reducer: ee.Reducer.mean(),
          scale: 10,
          //seriesProperty: 'landcover',
          //xProperty: 'system:time_start'
        });
chart2.style().set({
    position: 'bottom-left',
    width: '500px',
    height: '300px'
  });
      
        
print(chart2);




// Export the FeatureCollection to a KML file.
Export.table.toDrive({
  collection: Modis_pts,
  description:'Data_Extractor',
  folder: 'Google_earth_engine_data_extractor',
  fileFormat: 'CSV'
});


Map.layers().reset([layer,layer2,layer3]);


  
    // .median();

}

// print(s2Collection);

// var s2Collection = ee.ImageCollection("COPERNICUS/S2_SR").filterDate(start_date,end_date).filterBounds(geometry).filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE',10));
// // var s2Collection =ee.ImageCollection("COPERNICUS/S2_SR")
// var s2Collection= s2Collection.map(renderDateRange);
// print('Size of S2 Collection',s2Collection.size());
// print('Cloud free Sentinel 2 collection',s2Collection);
// Map.addLayer(s2Collection.median().clip(geometry),{},"Sentinel 2",0);

