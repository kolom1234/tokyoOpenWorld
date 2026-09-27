<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:brid="http://www.opengis.net/citygml/bridge/2.0" xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:dem="http://www.opengis.net/citygml/relief/2.0" xmlns:frn="http://www.opengis.net/citygml/cityfurniture/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:grp="http://www.opengis.net/citygml/cityobjectgroup/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:pbase="http://www.opengis.net/citygml/profiles/base/2.0" xmlns:sch="http://www.ascc.net/xml/schematron" xmlns:smil20="http://www.w3.org/2001/SMIL20/" xmlns:smil20lang="http://www.w3.org/2001/SMIL20/Language" xmlns:tex="http://www.opengis.net/citygml/texturedsurface/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:tun="http://www.opengis.net/citygml/tunnel/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.2" xmlns:veg="http://www.opengis.net/citygml/vegetation/2.0" xmlns:wtr="http://www.opengis.net/citygml/waterbody/2.0" xmlns:xAL="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.geospatial.jp/iur/uro/3.2 ../../schemas/iur/uro/3.2/urbanObject.xsd http://www.opengis.net/citygml/2.0 http://schemas.opengis.net/citygml/2.0/cityGMLBase.xsd http://www.opengis.net/citygml/landuse/2.0 http://schemas.opengis.net/citygml/landuse/2.0/landUse.xsd http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd http://www.opengis.net/citygml/transportation/2.0 http://schemas.opengis.net/citygml/transportation/2.0/transportation.xsd http://www.opengis.net/citygml/generics/2.0 http://schemas.opengis.net/citygml/generics/2.0/generics.xsd http://www.opengis.net/citygml/cityobjectgroup/2.0 http://schemas.opengis.net/citygml/cityobjectgroup/2.0/cityObjectGroup.xsd http://www.opengis.net/gml http://schemas.opengis.net/gml/3.1.1/base/gml.xsd http://www.opengis.net/citygml/cityfurniture/2.0 http://schemas.opengis.net/citygml/cityfurniture/2.0/cityFurniture.xsd http://www.opengis.net/citygml/vegetation/2.0 http://schemas.opengis.net/citygml/vegetation/2.0/vegetation.xsd http://www.opengis.net/citygml/appearance/2.0 http://schemas.opengis.net/citygml/appearance/2.0/appearance.xsd">
	<gml:boundedBy>
		<gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
			<gml:lowerCorner>35.64968834955461 139.68678755241868 0</gml:lowerCorner>
			<gml:upperCorner>35.65849526295373 139.700271644954 44.912</gml:upperCorner>
		</gml:Envelope>
	</gml:boundedBy>

	<core:cityObjectMember>
		<tran:Road gml:id="tran_addb0b2a-8dc5-4fe1-ba8d-8baac0e95ef8">
			<core:creationDate>2024-03-15</core:creationDate>
			<tran:class codeSpace="../../codelists/TransportationComplex_class.xml">1040</tran:class>
			<tran:function codeSpace="../../codelists/Road_function.xml">9020</tran:function>
			<tran:usage codeSpace="../../codelists/Road_usage.xml">9</tran:usage>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="tran_33fe1ce8-5aac-4b8c-94c4-d75609ac21f5">
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_5b7440e9-3701-4d34-b7c0-fdde442805b9">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.657393765157 139.6991958982731 0 35.65756366502908 139.69910670602712 0 35.65753835151964 139.6990386039085 0 35.65736843285485 139.699127873613 0 35.657393765157 139.6991958982731 0</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</tran:lod2MultiSurface>
				</tran:TrafficArea>
			</tran:trafficArea>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="traf_e903563d-8483-4bc8-9527-bb2afdc1edb2">
					<core:creationDate>2024-03-15</core:creationDate>
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod3MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_46fd27fa-e80f-4530-b408-b48408b5a1e3">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.657393765157 139.6991958982731 20.54 35.65756365601536 139.69910670604222 20.24 35.6575383325908 139.69903860394018 20.242 35.657393765157 139.6991958982731 20.54</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_85ff516e-4e52-446f-b865-354c71d9f3cb">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.657393765157 139.6991958982731 20.54 35.6575383325908 139.69903860394018 20.242 35.65736844186857 139.69912787359792 20.548 35.657393765157 139.6991958982731 20.54</gml:posList>
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
									<gml:posList>35.657393765157 139.6991958982731 0 35.65756366502908 139.69910670602712 0 35.65753835061826 139.69903860391 0 35.65736843285362 139.69912787250854 0 35.657393765157 139.6991958982731 0</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly_5b7440e9-3701-4d34-b7c0-fdde442805b9"></gml:surfaceMember>
						</gml:CompositeSurface>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</tran:lod2MultiSurface>
			<tran:lod3MultiSurface>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:CompositeSurface>
							<gml:surfaceMember xlink:href="#poly_46fd27fa-e80f-4530-b408-b48408b5a1e3"></gml:surfaceMember>
							<gml:surfaceMember xlink:href="#poly_85ff516e-4e52-446f-b865-354c71d9f3cb"></gml:surfaceMember>
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
	<core:cityObjectMember>
		<tran:Road gml:id="tran_846d5f4e-8818-417c-ba2f-8d60253afc7b">
			<core:creationDate>2024-03-15</core:creationDate>
			<tran:class codeSpace="../../codelists/TransportationComplex_class.xml">1040</tran:class>
			<tran:function codeSpace="../../codelists/Road_function.xml">9020</tran:function>
			<tran:usage codeSpace="../../codelists/Road_usage.xml">9</tran:usage>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="tran_a0184a2b-191b-4d01-aefc-d18394d5882e">
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_3753747f-b35d-4791-98c7-9b486ff2246b">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65792608556388 139.6997360800825 0 35.65828407918184 139.69954374978326 0 35.65826076019125 139.6994865766219 0 35.65824562870951 139.6994962117625 0 35.657916460222474 139.6996714866719 0 35.65792608556388 139.6997360800825 0</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</tran:lod2MultiSurface>
				</tran:TrafficArea>
			</tran:trafficArea>
			<tran:trafficArea>
				<tran:TrafficArea gml:id="traf_098118da-397f-46b3-86dc-f3f0ad02d1ab">
					<core:creationDate>2024-03-15</core:creationDate>
					<tran:function codeSpace="../../codelists/TrafficArea_function.xml">1000</tran:function>
					<tran:lod3MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_e15c9a90-7178-4568-b149-2728b17a6b7a">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65791645120751 139.69967148558246 17.55 35.65792610449272 139.69973608005097 17.55 35.65824560978068 139.69949621179407 16.956 35.65791645120751 139.69967148558246 17.55</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_144b43e7-87e7-4c2c-83ff-f74a3dc3dacd">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65824560978068 139.69949621179407 16.956 35.65828407918184 139.69954374978326 16.969 35.65826074216502 139.6994865777564 16.989 35.65824560978068 139.69949621179407 16.956</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly_2d02c2f5-2ea8-4bc6-a224-c230a591c54c">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65792610449272 139.69973608005097 17.55 35.65828407918184 139.69954374978326 16.969 35.65824560978068 139.69949621179407 16.956 35.65792610449272 139.69973608005097 17.55</gml:posList>
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
									<gml:posList>35.65792608556388 139.6997360800825 0 35.65828407918184 139.69954374978326 0 35.658260760192476 139.69948657772633 0 35.65824562780814 139.699496211764 0 35.65791646022125 139.69967148556742 0 35.65792608556388 139.6997360800825 0</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly_3753747f-b35d-4791-98c7-9b486ff2246b"></gml:surfaceMember>
						</gml:CompositeSurface>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</tran:lod2MultiSurface>
			<tran:lod3MultiSurface>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:CompositeSurface>
							<gml:surfaceMember xlink:href="#poly_e15c9a90-7178-4568-b149-2728b17a6b7a"></gml:surfaceMember>
							<gml:surfaceMember xlink:href="#poly_144b43e7-87e7-4c2c-83ff-f74a3dc3dacd"></gml:surfaceMember>
							<gml:surfaceMember xlink:href="#poly_2d02c2f5-2ea8-4bc6-a224-c230a591c54c"></gml:surfaceMember>
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
