<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:brid="http://www.opengis.net/citygml/bridge/2.0" xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:dem="http://www.opengis.net/citygml/relief/2.0" xmlns:frn="http://www.opengis.net/citygml/cityfurniture/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:grp="http://www.opengis.net/citygml/cityobjectgroup/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:pbase="http://www.opengis.net/citygml/profiles/base/2.0" xmlns:sch="http://www.ascc.net/xml/schematron" xmlns:smil20="http://www.w3.org/2001/SMIL20/" xmlns:smil20lang="http://www.w3.org/2001/SMIL20/Language" xmlns:tex="http://www.opengis.net/citygml/texturedsurface/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:tun="http://www.opengis.net/citygml/tunnel/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.2" xmlns:veg="http://www.opengis.net/citygml/vegetation/2.0" xmlns:wtr="http://www.opengis.net/citygml/waterbody/2.0" xmlns:xAL="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.geospatial.jp/iur/uro/3.2 ../../schemas/iur/uro/3.2/urbanObject.xsd http://www.opengis.net/citygml/2.0 http://schemas.opengis.net/citygml/2.0/cityGMLBase.xsd http://www.opengis.net/citygml/landuse/2.0 http://schemas.opengis.net/citygml/landuse/2.0/landUse.xsd http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd http://www.opengis.net/citygml/transportation/2.0 http://schemas.opengis.net/citygml/transportation/2.0/transportation.xsd http://www.opengis.net/citygml/generics/2.0 http://schemas.opengis.net/citygml/generics/2.0/generics.xsd http://www.opengis.net/citygml/cityobjectgroup/2.0 http://schemas.opengis.net/citygml/cityobjectgroup/2.0/cityObjectGroup.xsd http://www.opengis.net/gml http://schemas.opengis.net/gml/3.1.1/base/gml.xsd http://www.opengis.net/citygml/appearance/2.0 http://schemas.opengis.net/citygml/appearance/2.0/appearance.xsd">
	<gml:boundedBy>
		<gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
			<gml:lowerCorner>35.649851131266246 139.69975966140015 0</gml:lowerCorner>
			<gml:upperCorner>35.6585406218847 139.7130850519176 196.91</gml:upperCorner>
		</gml:Envelope>
	</gml:boundedBy>

	<core:cityObjectMember>
		<bldg:Building gml:id="bldg_b131a18c-3317-4647-b9e8-13dec811f99c">
			<core:creationDate>2024-03-15</core:creationDate>
			<gen:stringAttribute name="13+区市町村コード+大字・町コード+町・丁目コード">
				<gen:value>13113020001</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="地区計画">
				<gen:value>道玄坂一丁目地区</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="大字・町コード">
				<gen:value>20</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="延べ面積換算係数">
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="町・丁目コード">
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="説明注記">
				<gen:value> </gen:value>
			</gen:stringAttribute>
			<bldg:class codeSpace="../../codelists/Building_class.xml">3002</bldg:class>
			<bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
			<bldg:measuredHeight uom="m">36.8</bldg:measuredHeight>
			<bldg:storeysAboveGround>9</bldg:storeysAboveGround>
			<bldg:storeysBelowGround>1</bldg:storeysBelowGround>
			<bldg:lod0RoofEdge>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.658083676928804 139.70025181949572 0 35.65810812036481 139.70026646821248 0 35.658171893611744 139.70022659091126 0 35.65810297041517 139.7000110160012 0 35.658011349120166 139.70005482739307 0 35.658083676928804 139.70025181949572 0</gml:posList>
								</gml:LinearRing>
							</gml:exterior>
						</gml:Polygon>
					</gml:surfaceMember>
				</gml:MultiSurface>
			</bldg:lod0RoofEdge>
			<bldg:lod1Solid>
				<gml:Solid>
					<gml:exterior>
						<gml:CompositeSurface>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658083676928804 139.70025181949572 16.2 35.658011349120166 139.70005482739307 16.2 35.65810297041517 139.7000110160012 16.2 35.658171893611744 139.70022659091126 16.2 35.65810812036481 139.70026646821248 16.2 35.658083676928804 139.70025181949572 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658083676928804 139.70025181949572 16.2 35.65810812036481 139.70026646821248 16.2 35.65810812036481 139.70026646821248 53 35.658083676928804 139.70025181949572 53 35.658083676928804 139.70025181949572 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65810812036481 139.70026646821248 16.2 35.658171893611744 139.70022659091126 16.2 35.658171893611744 139.70022659091126 53 35.65810812036481 139.70026646821248 53 35.65810812036481 139.70026646821248 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658171893611744 139.70022659091126 16.2 35.65810297041517 139.7000110160012 16.2 35.65810297041517 139.7000110160012 53 35.658171893611744 139.70022659091126 53 35.658171893611744 139.70022659091126 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65810297041517 139.7000110160012 16.2 35.658011349120166 139.70005482739307 16.2 35.658011349120166 139.70005482739307 53 35.65810297041517 139.7000110160012 53 35.65810297041517 139.7000110160012 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658011349120166 139.70005482739307 16.2 35.658083676928804 139.70025181949572 16.2 35.658083676928804 139.70025181949572 53 35.658011349120166 139.70005482739307 53 35.658011349120166 139.70005482739307 16.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658083676928804 139.70025181949572 53 35.65810812036481 139.70026646821248 53 35.658171893611744 139.70022659091126 53 35.65810297041517 139.7000110160012 53 35.658011349120166 139.70005482739307 53 35.658083676928804 139.70025181949572 53</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod1Solid>
			<bldg:lod2Solid>
				<gml:Solid>
					<gml:exterior>
						<gml:CompositeSurface>
							<gml:surfaceMember xlink:href="#poly-99cc58d2-57f8-459c-a4c4-0e2df492af9d"/>
							<gml:surfaceMember xlink:href="#poly-fab04b39-3524-45cb-883d-6ad7bbfb05ca"/>
							<gml:surfaceMember xlink:href="#poly-3c4bf792-4bfc-4756-a686-84fe897108fc"/>
							<gml:surfaceMember xlink:href="#poly-792faa6a-a166-4bf9-90f2-6ea8c49a1aef"/>
							<gml:surfaceMember xlink:href="#poly-55444460-da81-4bd8-b224-b145c719e298"/>
							<gml:surfaceMember xlink:href="#poly-69e4af0d-bcf6-4eaf-a839-26714fcbd472"/>
							<gml:surfaceMember xlink:href="#poly-0de6a350-ccb7-4a8b-8a67-462359a0d772"/>
							<gml:surfaceMember xlink:href="#poly-1c5e9ba2-700d-4051-927e-da9bece4d53c"/>
							<gml:surfaceMember xlink:href="#poly-ab8746e1-d3c2-44e2-a05f-1a423aa9650b"/>
							<gml:surfaceMember xlink:href="#poly-49598060-d541-419e-857b-1f85dded9f94"/>
							<gml:surfaceMember xlink:href="#poly-cc9f4d27-f05a-4751-b47a-1d5248430871"/>
							<gml:surfaceMember xlink:href="#poly-fb6be133-63de-4c47-a936-5622d51b728d"/>
							<gml:surfaceMember xlink:href="#poly-d856a9da-b3af-466a-baaf-45fca637d7b2"/>
							<gml:surfaceMember xlink:href="#poly-7f64b035-6818-4670-93fe-ae5854e9cd01"/>
							<gml:surfaceMember xlink:href="#poly-54ecdf7c-b82b-4e15-806d-45af90254d8b"/>
							<gml:surfaceMember xlink:href="#poly-a3397bd9-5270-42eb-ae53-b568a2cb95eb"/>
							<gml:surfaceMember xlink:href="#poly-f1d7af2f-da7e-4c25-aae2-54752ba1ad4d"/>
							<gml:surfaceMember xlink:href="#poly-a8748677-2eeb-4ac0-85fb-34344a974514"/>
							<gml:surfaceMember xlink:href="#poly-b6dbac8f-bfdf-4326-9bf4-34cb89c5b9d2"/>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod2Solid>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_b131a18c-3317-4647-b9e8-13dec811f99c_BuildingInstallation_1071">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-15ff9014-d435-4e8f-bd46-704110fcef2e">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65809613746956 139.70017348182924 48.3 35.65809263816543 139.70016354753238 48.3 35.65810020527631 139.7001595368377 48.3 35.65810370459299 139.70016948217986 48.3 35.65809613746956 139.70017348182924 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-3c6eda43-44ae-4a93-8e06-28a2a03aa95d">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65804919568735 139.70008546837568 48.3 35.65803297961509 139.70009330381265 48.3 35.65802879186371 139.70008030028495 48.3 35.658045007935115 139.70007246484573 48.3 35.65804919568735 139.70008546837568 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a5eb20dd-6a0d-46a4-8776-014f099619f4">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65809153533233 139.70011179454596 48.3 35.658084282996754 139.70009072252398 48.3 35.65809130068324 139.70008708825065 48.3 35.658098553031664 139.70010817131867 48.3 35.65809153533233 139.70011179454596 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-83129718-96d4-4072-bd42-746890b6c029">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65803788793799 139.70010583122908 48.3 35.658057716561196 139.70009622266454 48.3 35.658076565796115 139.7001546170774 48.3 35.658056728154556 139.70016422564476 48.3 35.65803788793799 139.70010583122908 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-cf65a470-65d2-455c-a6eb-12fcd8c492f7">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65810152971994 139.70014271376888 48.3 35.658094277377565 139.70012163069694 48.3 35.658101304090934 139.70011800745542 48.3 35.658108547420206 139.70013909054384 48.3 35.65810152971994 139.70014271376888 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9bc86794-25df-49bf-bff8-dc9fefbac8a1">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9bc86794-25df-49bf-bff8-dc9fefbac8a1_0">
											<gml:posList>35.658045007935115 139.70007246484573 48.3 35.65802879186371 139.70008030028495 48.3 35.65802879186371 139.70008030028495 50.967 35.658045007935115 139.70007246484573 50.967 35.658045007935115 139.70007246484573 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-489a136e-5d62-4c93-9ee6-45b3d7c0494a">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-489a136e-5d62-4c93-9ee6-45b3d7c0494a_0">
											<gml:posList>35.65804919568735 139.70008546837568 48.3 35.658045007935115 139.70007246484573 48.3 35.658045007935115 139.70007246484573 50.967 35.65804919568735 139.70008546837568 50.967 35.65804919568735 139.70008546837568 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-630a097f-5fa8-410e-9c71-24439f087730">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-630a097f-5fa8-410e-9c71-24439f087730_0">
											<gml:posList>35.65804919568735 139.70008546837568 50.967 35.658045007935115 139.70007246484573 50.967 35.65802879186371 139.70008030028495 50.967 35.65803297961509 139.70009330381265 50.967 35.65804919568735 139.70008546837568 50.967</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-553b417d-be31-4e66-b702-5dfbbb217665">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-553b417d-be31-4e66-b702-5dfbbb217665_0">
											<gml:posList>35.65802879186371 139.70008030028495 48.3 35.65803297961509 139.70009330381265 48.3 35.65803297961509 139.70009330381265 50.967 35.65802879186371 139.70008030028495 50.967 35.65802879186371 139.70008030028495 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-c52b98e7-7e20-49dc-b4ce-ebefac470cc4">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-c52b98e7-7e20-49dc-b4ce-ebefac470cc4_0">
											<gml:posList>35.658084282996754 139.70009072252398 51.146 35.65809130068324 139.70008708825065 51.146 35.65809130068324 139.70008708825065 48.3 35.658084282996754 139.70009072252398 48.3 35.658084282996754 139.70009072252398 51.146</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-df426edb-34dd-4ce4-81b2-118458443176">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-df426edb-34dd-4ce4-81b2-118458443176_0">
											<gml:posList>35.65803297961509 139.70009330381265 48.3 35.65804919568735 139.70008546837568 48.3 35.65804919568735 139.70008546837568 50.967 35.65803297961509 139.70009330381265 50.967 35.65803297961509 139.70009330381265 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-280c7ebb-4806-467d-a8c9-516d10514b23">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-280c7ebb-4806-467d-a8c9-516d10514b23_0">
											<gml:posList>35.658098553031664 139.70010817131867 48.3 35.65809130068324 139.70008708825065 48.3 35.65809130068324 139.70008708825065 51.146 35.658098553031664 139.70010817131867 51.146 35.658098553031664 139.70010817131867 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-cbd7df74-7b13-4f4a-84b4-e2ed07a60f3d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-cbd7df74-7b13-4f4a-84b4-e2ed07a60f3d_0">
											<gml:posList>35.65809153533233 139.70011179454596 51.146 35.658098553031664 139.70010817131867 51.146 35.65809130068324 139.70008708825065 51.146 35.658084282996754 139.70009072252398 51.146 35.65809153533233 139.70011179454596 51.146</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-402388ef-e1ff-49d7-8986-1652ebc30644">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-402388ef-e1ff-49d7-8986-1652ebc30644_0">
											<gml:posList>35.658057716561196 139.70009622266454 48.3 35.65803788793799 139.70010583122908 48.3 35.65803788793799 139.70010583122908 51.649 35.658057716561196 139.70009622266454 51.649 35.658057716561196 139.70009622266454 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-58dea603-5b05-465d-b169-364109856db6">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-58dea603-5b05-465d-b169-364109856db6_0">
											<gml:posList>35.658084282996754 139.70009072252398 48.3 35.65809153533233 139.70011179454596 48.3 35.65809153533233 139.70011179454596 51.146 35.658084282996754 139.70009072252398 51.146 35.658084282996754 139.70009072252398 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-cf3a68df-ebc0-4693-acaa-41d65764f1a7">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-cf3a68df-ebc0-4693-acaa-41d65764f1a7_0">
											<gml:posList>35.65809153533233 139.70011179454596 48.3 35.658098553031664 139.70010817131867 48.3 35.658098553031664 139.70010817131867 51.146 35.65809153533233 139.70011179454596 51.146 35.65809153533233 139.70011179454596 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-71527656-2fe5-4d43-8053-7a85b5af2c05">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-71527656-2fe5-4d43-8053-7a85b5af2c05_0">
											<gml:posList>35.658101304090934 139.70011800745542 48.3 35.658094277377565 139.70012163069694 48.3 35.658094277377565 139.70012163069694 51.146 35.658101304090934 139.70011800745542 51.146 35.658101304090934 139.70011800745542 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-89d0cb76-f5d4-4b90-9f0f-1116b5eb3914">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-89d0cb76-f5d4-4b90-9f0f-1116b5eb3914_0">
											<gml:posList>35.658057716561196 139.70009622266454 48.3 35.658057716561196 139.70009622266454 51.649 35.658076565796115 139.7001546170774 51.649 35.658076565796115 139.7001546170774 48.3 35.658057716561196 139.70009622266454 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-53427147-8516-4abb-b6f1-f2f1b63e591a">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-53427147-8516-4abb-b6f1-f2f1b63e591a_0">
											<gml:posList>35.658108547420206 139.70013909054384 48.3 35.658101304090934 139.70011800745542 48.3 35.658101304090934 139.70011800745542 51.146 35.658108547420206 139.70013909054384 51.146 35.658108547420206 139.70013909054384 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-d8ac1da3-78d6-41fb-8bee-705fad502e81">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-d8ac1da3-78d6-41fb-8bee-705fad502e81_0">
											<gml:posList>35.65803788793799 139.70010583122908 51.649 35.658056728154556 139.70016422564476 51.649 35.658076565796115 139.7001546170774 51.649 35.658057716561196 139.70009622266454 51.649 35.65803788793799 139.70010583122908 51.649</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-2b6d6790-cbf8-43fe-b417-7cc0734f159e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-2b6d6790-cbf8-43fe-b417-7cc0734f159e_0">
											<gml:posList>35.658101304090934 139.70011800745542 51.146 35.658094277377565 139.70012163069694 51.146 35.65810152971994 139.70014271376888 51.146 35.658108547420206 139.70013909054384 51.146 35.658101304090934 139.70011800745542 51.146</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-55a13f15-1143-4c62-a782-48382fe65321">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-55a13f15-1143-4c62-a782-48382fe65321_0">
											<gml:posList>35.658094277377565 139.70012163069694 48.3 35.65810152971994 139.70014271376888 48.3 35.65810152971994 139.70014271376888 51.146 35.658094277377565 139.70012163069694 51.146 35.658094277377565 139.70012163069694 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-caf23919-16d3-42d7-87b0-ef78a1fc7926">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-caf23919-16d3-42d7-87b0-ef78a1fc7926_0">
											<gml:posList>35.658056728154556 139.70016422564476 48.3 35.658056728154556 139.70016422564476 51.649 35.65803788793799 139.70010583122908 51.649 35.65803788793799 139.70010583122908 48.3 35.658056728154556 139.70016422564476 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-4c2f8790-f169-4c76-bb82-f0b34c7fc0b9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-4c2f8790-f169-4c76-bb82-f0b34c7fc0b9_0">
											<gml:posList>35.65810152971994 139.70014271376888 48.3 35.658108547420206 139.70013909054384 48.3 35.658108547420206 139.70013909054384 51.146 35.65810152971994 139.70014271376888 51.146 35.65810152971994 139.70014271376888 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-78d67b89-b25b-427b-bd73-329783cb7253">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-78d67b89-b25b-427b-bd73-329783cb7253_0">
											<gml:posList>35.658056728154556 139.70016422564476 48.3 35.658076565796115 139.7001546170774 48.3 35.658076565796115 139.7001546170774 51.649 35.658056728154556 139.70016422564476 51.649 35.658056728154556 139.70016422564476 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-35982196-d1ff-4e79-9d59-458694972488">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-35982196-d1ff-4e79-9d59-458694972488_0">
											<gml:posList>35.65809263816543 139.70016354753238 57.408 35.65810020527631 139.7001595368377 57.408 35.65810020527631 139.7001595368377 48.3 35.65809263816543 139.70016354753238 48.3 35.65809263816543 139.70016354753238 57.408</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ee88b4bd-699e-41de-9744-c0dbd5554de9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ee88b4bd-699e-41de-9744-c0dbd5554de9_0">
											<gml:posList>35.65810370459299 139.70016948217986 48.3 35.65810020527631 139.7001595368377 48.3 35.65810020527631 139.7001595368377 57.408 35.65810370459299 139.70016948217986 57.408 35.65810370459299 139.70016948217986 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-bd3b9578-4193-40d8-8309-57ca05e33a44">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-bd3b9578-4193-40d8-8309-57ca05e33a44_0">
											<gml:posList>35.65809613746956 139.70017348182924 57.408 35.65810370459299 139.70016948217986 57.408 35.65810020527631 139.7001595368377 57.408 35.65809263816543 139.70016354753238 57.408 35.65809613746956 139.70017348182924 57.408</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e583d8f7-cf53-4b93-9ccf-0550325407e6">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e583d8f7-cf53-4b93-9ccf-0550325407e6_0">
											<gml:posList>35.65809263816543 139.70016354753238 48.3 35.65809613746956 139.70017348182924 48.3 35.65809613746956 139.70017348182924 57.408 35.65809263816543 139.70016354753238 57.408 35.65809263816543 139.70016354753238 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-c5b42aa3-6ae8-4227-a519-a816529129de">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-c5b42aa3-6ae8-4227-a519-a816529129de_0">
											<gml:posList>35.65809613746956 139.70017348182924 48.3 35.65810370459299 139.70016948217986 48.3 35.65810370459299 139.70016948217986 57.408 35.65809613746956 139.70017348182924 57.408 35.65809613746956 139.70017348182924 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_b131a18c-3317-4647-b9e8-13dec811f99c_BuildingInstallation_1051">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a3d2e2b6-2703-4b94-8cf0-7e7171932d40">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65813952044103 139.70019777412907 48.3 35.65814132475461 139.7002154976673 48.3 35.658084291296724 139.70024495980405 48.3 35.65808370364678 139.70024337036233 48.3 35.6581397731847 139.7002144068299 48.3 35.658137422039886 139.70019125027204 48.3 35.65813952044103 139.70019777412907 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-eedb05e5-d0ad-44a3-acaa-d1ea357bb1ed">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658137422039886 139.70019125027204 54.1 35.65813671127634 139.70018429337387 54.1 35.658138126199724 139.7001840811784 54.1 35.65813952044103 139.70019777412907 54.1 35.658137422039886 139.70019125027204 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-81a5241b-8b9f-4f0b-b216-ed095bae9852">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65808193104242 139.7002461786218 54.1 35.65806967151299 139.70021280021595 54.1 35.65807096869638 139.70021208016684 54.1 35.658082658652326 139.70024391327962 54.1 35.65808370364678 139.70024337036233 54.1 35.658084291296724 139.70024495980405 54.1 35.65808193104242 139.7002461786218 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-20fca7be-0d76-4f79-abbe-0d18b2a821d8">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-20fca7be-0d76-4f79-abbe-0d18b2a821d8_0">
											<gml:posList>35.65806967151299 139.70021280021595 68.7 35.65807096869638 139.70021208016684 68.7 35.65807096869638 139.70021208016684 54.1 35.65806967151299 139.70021280021595 54.1 35.65806967151299 139.70021280021595 68.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e02449bc-3f51-4502-8dc6-46b31f565a05">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e02449bc-3f51-4502-8dc6-46b31f565a05_0">
											<gml:posList>35.65813671127634 139.70018429337387 68.7 35.6581397731847 139.7002144068299 68.7 35.658082658652326 139.70024391327962 68.7 35.65807096869638 139.70021208016684 68.7 35.65806967151299 139.70021280021595 68.7 35.65808193104242 139.7002461786218 68.7 35.65814132475461 139.7002154976673 68.7 35.658138126199724 139.7001840811784 68.7 35.65813671127634 139.70018429337387 68.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-04e25634-18dd-4996-9f40-4ec7e5ba4de5">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-04e25634-18dd-4996-9f40-4ec7e5ba4de5_0">
											<gml:posList>35.65813671127634 139.70018429337387 54.1 35.65813671127634 139.70018429337387 68.7 35.658138126199724 139.7001840811784 68.7 35.658138126199724 139.7001840811784 54.1 35.65813671127634 139.70018429337387 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e3ea9b7a-1256-46e1-82ee-90a9aa6aa196">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e3ea9b7a-1256-46e1-82ee-90a9aa6aa196_0">
											<gml:posList>35.6581397731847 139.7002144068299 48.3 35.6581397731847 139.7002144068299 68.7 35.65813671127634 139.70018429337387 68.7 35.65813671127634 139.70018429337387 54.1 35.658137422039886 139.70019125027204 54.1 35.658137422039886 139.70019125027204 48.3 35.6581397731847 139.7002144068299 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-4d3864e4-81ed-43b6-a81d-229bcdc1888b">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-4d3864e4-81ed-43b6-a81d-229bcdc1888b_0">
											<gml:posList>35.65813952044103 139.70019777412907 48.3 35.658137422039886 139.70019125027204 48.3 35.658137422039886 139.70019125027204 54.1 35.65813952044103 139.70019777412907 54.1 35.65813952044103 139.70019777412907 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-7e5d8f2a-6d53-46e0-aa41-78eef2efea4e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-7e5d8f2a-6d53-46e0-aa41-78eef2efea4e_0">
											<gml:posList>35.65813952044103 139.70019777412907 54.1 35.658138126199724 139.7001840811784 54.1 35.658138126199724 139.7001840811784 68.7 35.65814132475461 139.7002154976673 68.7 35.65814132475461 139.7002154976673 48.3 35.65813952044103 139.70019777412907 48.3 35.65813952044103 139.70019777412907 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9b999b00-c6c6-4d29-a1bd-6bd40bfc8372">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9b999b00-c6c6-4d29-a1bd-6bd40bfc8372_0">
											<gml:posList>35.65808193104242 139.7002461786218 54.1 35.65808193104242 139.7002461786218 68.7 35.65806967151299 139.70021280021595 68.7 35.65806967151299 139.70021280021595 54.1 35.65808193104242 139.7002461786218 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-d35ec5df-c7c9-457a-8c05-0479b5f445b5">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-d35ec5df-c7c9-457a-8c05-0479b5f445b5_0">
											<gml:posList>35.65807096869638 139.70021208016684 54.1 35.65807096869638 139.70021208016684 68.7 35.658082658652326 139.70024391327962 68.7 35.658082658652326 139.70024391327962 54.1 35.65807096869638 139.70021208016684 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-46d9882b-3b3e-4c52-991a-8d7669b1929d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-46d9882b-3b3e-4c52-991a-8d7669b1929d_0">
											<gml:posList>35.658084291296724 139.70024495980405 54.1 35.65808370364678 139.70024337036233 54.1 35.65808370364678 139.70024337036233 48.3 35.658084291296724 139.70024495980405 48.3 35.658084291296724 139.70024495980405 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9af14c12-fecf-4b5d-8b93-725aaa00066d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9af14c12-fecf-4b5d-8b93-725aaa00066d_0">
											<gml:posList>35.65808370364678 139.70024337036233 54.1 35.658082658652326 139.70024391327962 54.1 35.658082658652326 139.70024391327962 68.7 35.6581397731847 139.7002144068299 68.7 35.6581397731847 139.7002144068299 48.3 35.65808370364678 139.70024337036233 48.3 35.65808370364678 139.70024337036233 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a7c2fb51-49e8-4d6f-a1e7-b27111918d98">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-a7c2fb51-49e8-4d6f-a1e7-b27111918d98_0">
											<gml:posList>35.65814132475461 139.7002154976673 48.3 35.65814132475461 139.7002154976673 68.7 35.65808193104242 139.7002461786218 68.7 35.65808193104242 139.7002461786218 54.1 35.658084291296724 139.70024495980405 54.1 35.658084291296724 139.70024495980405 48.3 35.65814132475461 139.7002154976673 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:boundedBy>
				<bldg:GroundSurface gml:id="surface-99cc58d2-57f8-459c-a4c4-0e2df492af9d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-99cc58d2-57f8-459c-a4c4-0e2df492af9d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-99cc58d2-57f8-459c-a4c4-0e2df492af9d">
											<gml:posList>35.65808367692881 139.70025181949572 16.19 35.658011349120166 139.70005482739307 16.19 35.65810297041517 139.7000110160012 16.19 35.65817189361174 139.70022659091123 16.19 35.65810812036481 139.70026646821248 16.19 35.65808367692881 139.70025181949572 16.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:GroundSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-fab04b39-3524-45cb-883d-6ad7bbfb05ca">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fab04b39-3524-45cb-883d-6ad7bbfb05ca">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fab04b39-3524-45cb-883d-6ad7bbfb05ca">
											<gml:posList>35.658011349120166 139.70005482739307 54.1 35.65801517308009 139.70005675383595 54.1 35.65808358717609 139.70002397035404 54.1 35.65808519564535 139.70001946149995 54.1 35.658011349120166 139.70005482739307 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-69e4af0d-bcf6-4eaf-a839-26714fcbd472">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-69e4af0d-bcf6-4eaf-a839-26714fcbd472">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-69e4af0d-bcf6-4eaf-a839-26714fcbd472">
											<gml:posList>35.65808519564535 139.70001946149995 54.1 35.65808358717609 139.70002397035404 54.1 35.658151613352175 139.70023534977483 54.1 35.65815522069892 139.70023702256393 54.1 35.65808519564535 139.70001946149995 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-792faa6a-a166-4bf9-90f2-6ea8c49a1aef">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-792faa6a-a166-4bf9-90f2-6ea8c49a1aef">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-792faa6a-a166-4bf9-90f2-6ea8c49a1aef">
											<gml:posList>35.65810808901574 139.7002625695333 48.3 35.658151613352175 139.70023534977483 48.3 35.65808358717609 139.70002397035404 48.3 35.65801517308009 139.70005675383595 48.3 35.65808585539519 139.70024923145414 48.3 35.65810808901574 139.7002625695333 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-1c5e9ba2-700d-4051-927e-da9bece4d53c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-1c5e9ba2-700d-4051-927e-da9bece4d53c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-1c5e9ba2-700d-4051-927e-da9bece4d53c">
											<gml:posList>35.65810812036481 139.70026646821248 54.1 35.65815522069892 139.70023702256393 54.1 35.658151613352175 139.70023534977483 54.1 35.65810808901574 139.7002625695333 54.1 35.65810812036481 139.70026646821248 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-0de6a350-ccb7-4a8b-8a67-462359a0d772">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-0de6a350-ccb7-4a8b-8a67-462359a0d772">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-0de6a350-ccb7-4a8b-8a67-462359a0d772">
											<gml:posList>35.65817189361174 139.70022659091123 48.3 35.65810297041517 139.7000110160012 48.3 35.65808519564535 139.70001946149995 48.3 35.65815522069892 139.70023702256393 48.3 35.65817189361174 139.70022659091123 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-55444460-da81-4bd8-b224-b145c719e298">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-55444460-da81-4bd8-b224-b145c719e298">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-55444460-da81-4bd8-b224-b145c719e298">
											<gml:posList>35.65808367692881 139.70025181949572 54.1 35.65810812036481 139.70026646821248 54.1 35.65810808901574 139.7002625695333 54.1 35.65808585539519 139.70024923145414 54.1 35.65808367692881 139.70025181949572 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-3c4bf792-4bfc-4756-a686-84fe897108fc">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3c4bf792-4bfc-4756-a686-84fe897108fc">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3c4bf792-4bfc-4756-a686-84fe897108fc">
											<gml:posList>35.65808367692881 139.70025181949572 54.1 35.65808585539519 139.70024923145414 54.1 35.65801517308009 139.70005675383595 54.1 35.658011349120166 139.70005482739307 54.1 35.65808367692881 139.70025181949572 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-fb6be133-63de-4c47-a936-5622d51b728d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fb6be133-63de-4c47-a936-5622d51b728d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fb6be133-63de-4c47-a936-5622d51b728d">
											<gml:posList>35.65810297041517 139.7000110160012 16.19 35.658011349120166 139.70005482739307 16.19 35.658011349120166 139.70005482739307 54.1 35.65808519564535 139.70001946149995 54.1 35.65808519564535 139.70001946149995 48.3 35.65810297041517 139.7000110160012 48.3 35.65810297041517 139.7000110160012 16.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-b6dbac8f-bfdf-4326-9bf4-34cb89c5b9d2">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-b6dbac8f-bfdf-4326-9bf4-34cb89c5b9d2">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-b6dbac8f-bfdf-4326-9bf4-34cb89c5b9d2">
											<gml:posList>35.65815522069892 139.70023702256393 48.3 35.65815522069892 139.70023702256393 54.1 35.65810812036481 139.70026646821248 54.1 35.65810812036481 139.70026646821248 16.19 35.65817189361174 139.70022659091123 16.19 35.65817189361174 139.70022659091123 48.3 35.65815522069892 139.70023702256393 48.3</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-54ecdf7c-b82b-4e15-806d-45af90254d8b">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-54ecdf7c-b82b-4e15-806d-45af90254d8b">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-54ecdf7c-b82b-4e15-806d-45af90254d8b">
											<gml:posList>35.65808358717609 139.70002397035404 54.1 35.65808358717609 139.70002397035404 48.3 35.658151613352175 139.70023534977483 48.3 35.658151613352175 139.70023534977483 54.1 35.65808358717609 139.70002397035404 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-a3397bd9-5270-42eb-ae53-b568a2cb95eb">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-a3397bd9-5270-42eb-ae53-b568a2cb95eb">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-a3397bd9-5270-42eb-ae53-b568a2cb95eb">
											<gml:posList>35.65808519564535 139.70001946149995 54.1 35.65815522069892 139.70023702256393 54.1 35.65815522069892 139.70023702256393 48.3 35.65808519564535 139.70001946149995 48.3 35.65808519564535 139.70001946149995 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f1d7af2f-da7e-4c25-aae2-54752ba1ad4d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f1d7af2f-da7e-4c25-aae2-54752ba1ad4d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f1d7af2f-da7e-4c25-aae2-54752ba1ad4d">
											<gml:posList>35.658151613352175 139.70023534977483 54.1 35.658151613352175 139.70023534977483 48.3 35.65810808901574 139.7002625695333 48.3 35.65810808901574 139.7002625695333 54.1 35.658151613352175 139.70023534977483 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-a8748677-2eeb-4ac0-85fb-34344a974514">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-a8748677-2eeb-4ac0-85fb-34344a974514">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-a8748677-2eeb-4ac0-85fb-34344a974514">
											<gml:posList>35.65810297041517 139.7000110160012 16.19 35.65810297041517 139.7000110160012 48.3 35.65817189361174 139.70022659091123 48.3 35.65817189361174 139.70022659091123 16.19 35.65810297041517 139.7000110160012 16.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-7f64b035-6818-4670-93fe-ae5854e9cd01">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-7f64b035-6818-4670-93fe-ae5854e9cd01">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-7f64b035-6818-4670-93fe-ae5854e9cd01">
											<gml:posList>35.65810808901574 139.7002625695333 54.1 35.65810808901574 139.7002625695333 48.3 35.65808585539519 139.70024923145414 48.3 35.65808585539519 139.70024923145414 54.1 35.65810808901574 139.7002625695333 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-d856a9da-b3af-466a-baaf-45fca637d7b2">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-d856a9da-b3af-466a-baaf-45fca637d7b2">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-d856a9da-b3af-466a-baaf-45fca637d7b2">
											<gml:posList>35.65810812036481 139.70026646821248 16.19 35.65810812036481 139.70026646821248 54.1 35.65808367692881 139.70025181949572 54.1 35.65808367692881 139.70025181949572 16.19 35.65810812036481 139.70026646821248 16.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-ab8746e1-d3c2-44e2-a05f-1a423aa9650b">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-ab8746e1-d3c2-44e2-a05f-1a423aa9650b">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-ab8746e1-d3c2-44e2-a05f-1a423aa9650b">
											<gml:posList>35.65808585539519 139.70024923145414 54.1 35.65808585539519 139.70024923145414 48.3 35.65801517308009 139.70005675383595 48.3 35.65801517308009 139.70005675383595 54.1 35.65808585539519 139.70024923145414 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-49598060-d541-419e-857b-1f85dded9f94">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-49598060-d541-419e-857b-1f85dded9f94">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-49598060-d541-419e-857b-1f85dded9f94">
											<gml:posList>35.65808367692881 139.70025181949572 54.1 35.658011349120166 139.70005482739307 54.1 35.658011349120166 139.70005482739307 16.19 35.65808367692881 139.70025181949572 16.19 35.65808367692881 139.70025181949572 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-cc9f4d27-f05a-4751-b47a-1d5248430871">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-cc9f4d27-f05a-4751-b47a-1d5248430871">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-cc9f4d27-f05a-4751-b47a-1d5248430871">
											<gml:posList>35.65801517308009 139.70005675383595 54.1 35.65801517308009 139.70005675383595 48.3 35.65808358717609 139.70002397035404 48.3 35.65808358717609 139.70002397035404 54.1 35.65801517308009 139.70005675383595 54.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:address>
				<core:Address>
					<core:xalAddress>
						<xAL:AddressDetails>
							<xAL:Country>
								<xAL:CountryName>日本</xAL:CountryName>
								<xAL:Locality>
									<xAL:LocalityName Type="Town">東京都渋谷区道玄坂一丁目</xAL:LocalityName>
								</xAL:Locality>
							</xAL:Country>
						</xAL:AddressDetails>
					</core:xalAddress>
				</core:Address>
			</bldg:address>
			<uro:bldgDataQualityAttribute>
				<uro:DataQualityAttribute>
					<uro:geometrySrcDescLod0 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod0>
					<uro:geometrySrcDescLod1 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod1>
					<uro:geometrySrcDescLod2 codeSpace="../../codelists/DataQualityAttribute_geometrySrcDesc.xml">000</uro:geometrySrcDescLod2>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">201</uro:thematicSrcDesc>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">000</uro:thematicSrcDesc>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">023</uro:thematicSrcDesc>
					<uro:thematicSrcDesc codeSpace="../../codelists/DataQualityAttribute_thematicSrcDesc.xml">400</uro:thematicSrcDesc>
					<uro:appearanceSrcDescLod2 codeSpace="../../codelists/DataQualityAttribute_appearanceSrcDesc.xml">1</uro:appearanceSrcDescLod2>
					<uro:lodType codeSpace="../../codelists/Building_lodType.xml">2.2</uro:lodType>
					<uro:lod1HeightType codeSpace="../../codelists/DataQualityAttribute_lod1HeightType.xml">2</uro:lod1HeightType>
					<uro:publicSurveyDataQualityAttribute>
						<uro:PublicSurveyDataQualityAttribute>
							<uro:srcScaleLod0 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod0>
							<uro:srcScaleLod1 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod1>
							<uro:srcScaleLod2 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_srcScale.xml">1</uro:srcScaleLod2>
							<uro:publicSurveySrcDescLod0 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">023</uro:publicSurveySrcDescLod0>
							<uro:publicSurveySrcDescLod1 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">023</uro:publicSurveySrcDescLod1>
							<uro:publicSurveySrcDescLod1 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">012</uro:publicSurveySrcDescLod1>
							<uro:publicSurveySrcDescLod2 codeSpace="../../codelists/PublicSurveyDataQualityAttribute_geometrySrcDesc.xml">012</uro:publicSurveySrcDescLod2>
						</uro:PublicSurveyDataQualityAttribute>
					</uro:publicSurveyDataQualityAttribute>
				</uro:DataQualityAttribute>
			</uro:bldgDataQualityAttribute>
			<uro:bldgDisasterRiskAttribute>
				<uro:RiverFloodingRiskAttribute>
					<uro:description codeSpace="../../codelists/RiverFloodingRiskAttribute_description.xml">14</uro:description>
					<uro:rank codeSpace="../../codelists/RiverFloodingRiskAttribute_rank.xml">1</uro:rank>
					<uro:depth uom="m">0.256</uro:depth>
					<uro:adminType codeSpace="../../codelists/RiverFloodingRiskAttribute_adminType.xml">2</uro:adminType>
					<uro:scale codeSpace="../../codelists/RiverFloodingRiskAttribute_scale.xml">2</uro:scale>
				</uro:RiverFloodingRiskAttribute>
			</uro:bldgDisasterRiskAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">100</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key100.xml">11</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">101</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key101.xml">1</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">102</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key102.xml">0</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">103</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key103.xml">0</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">104</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key104.xml">0</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">105</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key105.xml">9</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:bldgKeyValuePairAttribute>
				<uro:KeyValuePairAttribute>
					<uro:key codeSpace="../../codelists/KeyValuePairAttribute_key.xml">106</uro:key>
					<uro:codeValue codeSpace="../../codelists/KeyValuePairAttribute_key106.xml">10</uro:codeValue>
				</uro:KeyValuePairAttribute>
			</uro:bldgKeyValuePairAttribute>
			<uro:buildingDetailAttribute>
				<uro:BuildingDetailAttribute>
					<uro:buildingRoofEdgeArea uom="m2">2.20532</uro:buildingRoofEdgeArea>
					<uro:fireproofStructureType codeSpace="../../codelists/BuildingDetailAttribute_fireproofStructureType.xml">1001</uro:fireproofStructureType>
					<uro:urbanPlanType codeSpace="../../codelists/Common_urbanPlanType.xml">21</uro:urbanPlanType>
					<uro:areaClassificationType codeSpace="../../codelists/Common_areaClassificationType.xml">22</uro:areaClassificationType>
					<uro:districtsAndZonesType codeSpace="../../codelists/Common_districtsAndZonesType.xml">10</uro:districtsAndZonesType>
					<uro:landUseType codeSpace="../../codelists/Common_landUseType.xml">212</uro:landUseType>
					<uro:detailedUsage codeSpace="../../codelists/BuildingDetailAttribute_detailedUsage.xml">1210</uro:detailedUsage>
					<uro:specifiedBuildingCoverageRate>80</uro:specifiedBuildingCoverageRate>
					<uro:specifiedFloorAreaRate>900</uro:specifiedFloorAreaRate>
					<uro:surveyYear>2021</uro:surveyYear>
				</uro:BuildingDetailAttribute>
			</uro:buildingDetailAttribute>
			<uro:buildingIDAttribute>
				<uro:BuildingIDAttribute>
					<uro:buildingID>13113-bldg-461</uro:buildingID>
					<uro:prefecture codeSpace="../../codelists/Common_localPublicAuthorities.xml">13</uro:prefecture>
					<uro:city codeSpace="../../codelists/Common_localPublicAuthorities.xml">13113</uro:city>
				</uro:BuildingIDAttribute>
			</uro:buildingIDAttribute>
		</bldg:Building>
	</core:cityObjectMember>
</core:CityModel>
