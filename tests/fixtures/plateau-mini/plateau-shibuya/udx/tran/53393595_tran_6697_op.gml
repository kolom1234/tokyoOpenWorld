<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:brid="http://www.opengis.net/citygml/bridge/2.0" xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:dem="http://www.opengis.net/citygml/relief/2.0" xmlns:frn="http://www.opengis.net/citygml/cityfurniture/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:grp="http://www.opengis.net/citygml/cityobjectgroup/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:pbase="http://www.opengis.net/citygml/profiles/base/2.0" xmlns:sch="http://www.ascc.net/xml/schematron" xmlns:smil20="http://www.w3.org/2001/SMIL20/" xmlns:smil20lang="http://www.w3.org/2001/SMIL20/Language" xmlns:tex="http://www.opengis.net/citygml/texturedsurface/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:tun="http://www.opengis.net/citygml/tunnel/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.2" xmlns:veg="http://www.opengis.net/citygml/vegetation/2.0" xmlns:wtr="http://www.opengis.net/citygml/waterbody/2.0" xmlns:xAL="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.geospatial.jp/iur/uro/3.2 ../../schemas/iur/uro/3.2/urbanObject.xsd http://www.opengis.net/citygml/2.0 http://schemas.opengis.net/citygml/2.0/cityGMLBase.xsd http://www.opengis.net/citygml/landuse/2.0 http://schemas.opengis.net/citygml/landuse/2.0/landUse.xsd http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd http://www.opengis.net/citygml/transportation/2.0 http://schemas.opengis.net/citygml/transportation/2.0/transportation.xsd http://www.opengis.net/citygml/generics/2.0 http://schemas.opengis.net/citygml/generics/2.0/generics.xsd http://www.opengis.net/citygml/cityobjectgroup/2.0 http://schemas.opengis.net/citygml/cityobjectgroup/2.0/cityObjectGroup.xsd http://www.opengis.net/gml http://schemas.opengis.net/gml/3.1.1/base/gml.xsd http://www.opengis.net/citygml/cityfurniture/2.0 http://schemas.opengis.net/citygml/cityfurniture/2.0/cityFurniture.xsd http://www.opengis.net/citygml/vegetation/2.0 http://schemas.opengis.net/citygml/vegetation/2.0/vegetation.xsd http://www.opengis.net/citygml/appearance/2.0 http://schemas.opengis.net/citygml/appearance/2.0/appearance.xsd">
	<gml:boundedBy>
		<gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
			<gml:lowerCorner>35.657867475632194 139.68731290045412 0</gml:lowerCorner>
			<gml:upperCorner>35.66678637708107 139.70030267361057 33.76</gml:upperCorner>
		</gml:Envelope>
	</gml:boundedBy>

	<core:cityObjectMember>
		<tran:Road gml:id="tran_f37025d9-3329-4212-b96d-2e4faa5964fc">
			<core:creationDate>2024-03-15</core:creationDate>
			<tran:class codeSpace="../../codelists/TransportationComplex_class.xml">1040</tran:class>
			<tran:function codeSpace="../../codelists/Road_function.xml">9020</tran:function>
			<tran:usage codeSpace="../../codelists/Road_usage.xml">9</tran:usage>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="tran_a01f528b-9118-4b08-ade4-37c6b742609f">
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_808b4b78-d240-462b-9871-cb5757046625">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658947086833194 139.69999227283054 0 35.65900478887204 139.7000049887459 0 35.65898994288547 139.69994769260913 0 35.658987584023244 139.69993388957064 0 35.65893727614545 139.699951458068 0 35.658947086833194 139.69999227283054 0</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</tran:lod2MultiSurface>
				</tran:TrafficArea>
			</tran:trafficArea>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="traf_2f36075a-0498-49b8-8675-cb1fe2843da5">
					<core:creationDate>2024-03-15</core:creationDate>
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod3MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_44df5700-3791-4e37-99f9-678061d10962">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65893728876344 139.69995145694259 15.62 35.658947086833194 139.69999227283054 15.56 35.6589899609117 139.69994769147468 15.62 35.65893728876344 139.69995145694259 15.62</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_62438999-d2ec-480d-827f-0eb62d27154e">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65893728876344 139.69995145694259 15.62 35.6589899609117 139.69994769147468 15.62 35.65898758402324 139.69993388957064 15.62 35.65893728876344 139.69995145694259 15.62</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_4d08e67c-86ef-49a9-be9a-e9e8af0f30e6">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658947086833194 139.69999227283054 15.56 35.659004779858314 139.70000498876087 15.531 35.6589899609117 139.69994769147468 15.62 35.658947086833194 139.69999227283054 15.56</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</tran:lod3MultiSurface>
				</tran:TrafficArea>
			</tran:trafficArea>
			<tran:lod1MultiSurface>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.6589470841303 139.6999922739395 0 35.65899701464948 139.69997498662798 0 35.658989942884254 139.69994769150466 0 35.658987584023244 139.69993388957064 0 35.65893727614545 139.699951458068 0 35.6589470841303 139.6999922739395 0</gml:posList>
								</gml:LinearRing>
							</gml:exterior>
						</gml:Polygon>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</tran:lod1MultiSurface>
			<tran:lod2MultiSurface>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:CompositeSurface>
							<gml:surfaceMember xlink:href="#poly_808b4b78-d240-462b-9871-cb5757046625"></gml:surfaceMember>
						</gml:CompositeSurface>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</tran:lod2MultiSurface>
			<tran:lod3MultiSurface>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:CompositeSurface>
							<gml:surfaceMember xlink:href="#poly_44df5700-3791-4e37-99f9-678061d10962"></gml:surfaceMember>
							<gml:surfaceMember xlink:href="#poly_62438999-d2ec-480d-827f-0eb62d27154e"></gml:surfaceMember>
							<gml:surfaceMember xlink:href="#poly_4d08e67c-86ef-49a9-be9a-e9e8af0f30e6"></gml:surfaceMember>
						</gml:CompositeSurface>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</tran:lod3MultiSurface>
			<uro:tranDataQualityAttribute>
				<uro:DataQualityAttribute>
					<uro:geometrySrcDescLod1 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod1>
					<uro:geometrySrcDescLod2 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod2>
					<uro:geometrySrcDescLod3 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod3>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">023</uro:thematicSrcDesc>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">400</uro:thematicSrcDesc>
					<uro:appearanceSrcDescLod3 codeSpace="../../codelists/DataQualityAttribute_appearanceSrcDesc.xml">99</uro:appearanceSrcDescLod3>
					<uro:lodType codeSpace="../../codelists/Road_lodType.xml">3.0</uro:lodType>
					<uro:publicSurveyDataQualityAttribute>
						<uro:PublicSurveyDataQualityAttribute>
							<uro:srcScaleLod1 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod1>
							<uro:srcScaleLod2 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod2>
							<uro:srcScaleLod3 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod3>
							<uro:publicSurveySrcDescLod1 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">023</uro:publicSurveySrcDescLod1>
							<uro:publicSurveySrcDescLod2 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">023</uro:publicSurveySrcDescLod2>
							<uro:publicSurveySrcDescLod3 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">012</uro:publicSurveySrcDescLod3>
						</uro:PublicSurveyDataQualityAttribute>
					</uro:publicSurveyDataQualityAttribute>
				</uro:DataQualityAttribute>
			</uro:tranDataQualityAttribute>
			<uro:roadStructureAttribute>
				<uro:RoadStructureAttribute>
					<uro:sectionType codeSpace="../../codelists/RoadStructureAttribute_sectionType.xml">1</uro:sectionType>
				</uro:RoadStructureAttribute>
			</uro:roadStructureAttribute>
		</tran:Road>
	</core:cityObjectMember>
</core:CityModel>
