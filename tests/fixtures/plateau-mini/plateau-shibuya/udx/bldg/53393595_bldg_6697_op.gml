<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:brid="http://www.opengis.net/citygml/bridge/2.0" xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:dem="http://www.opengis.net/citygml/relief/2.0" xmlns:frn="http://www.opengis.net/citygml/cityfurniture/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:grp="http://www.opengis.net/citygml/cityobjectgroup/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:pbase="http://www.opengis.net/citygml/profiles/base/2.0" xmlns:sch="http://www.ascc.net/xml/schematron" xmlns:smil20="http://www.w3.org/2001/SMIL20/" xmlns:smil20lang="http://www.w3.org/2001/SMIL20/Language" xmlns:tex="http://www.opengis.net/citygml/texturedsurface/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:tun="http://www.opengis.net/citygml/tunnel/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.2" xmlns:veg="http://www.opengis.net/citygml/vegetation/2.0" xmlns:wtr="http://www.opengis.net/citygml/waterbody/2.0" xmlns:xAL="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.geospatial.jp/iur/uro/3.2 ../../schemas/iur/uro/3.2/urbanObject.xsd http://www.opengis.net/citygml/2.0 http://schemas.opengis.net/citygml/2.0/cityGMLBase.xsd http://www.opengis.net/citygml/landuse/2.0 http://schemas.opengis.net/citygml/landuse/2.0/landUse.xsd http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd http://www.opengis.net/citygml/transportation/2.0 http://schemas.opengis.net/citygml/transportation/2.0/transportation.xsd http://www.opengis.net/citygml/generics/2.0 http://schemas.opengis.net/citygml/generics/2.0/generics.xsd http://www.opengis.net/citygml/cityobjectgroup/2.0 http://schemas.opengis.net/citygml/cityobjectgroup/2.0/cityObjectGroup.xsd http://www.opengis.net/gml http://schemas.opengis.net/gml/3.1.1/base/gml.xsd http://www.opengis.net/citygml/appearance/2.0 http://schemas.opengis.net/citygml/appearance/2.0/appearance.xsd">
	<gml:boundedBy>
		<gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
			<gml:lowerCorner>35.65819924613726 139.6873247768812 0</gml:lowerCorner>
			<gml:upperCorner>35.66699923572684 139.70013329872134 176.765</gml:upperCorner>
		</gml:Envelope>
	</gml:boundedBy>

	<core:cityObjectMember>
		<bldg:Building gml:id="bldg_15c46296-d449-4ea0-8c0a-0d1b6cb9ce73">
			<core:creationDate>2024-03-15</core:creationDate>
			<gen:stringAttribute name="延べ面積換算係数">
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="説明注記">
				<gen:value> </gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="大字・町コード">
				<gen:value>20</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="町・丁目コード">
				<gen:value>2</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="13+区市町村コード+大字・町コード+町・丁目コード">
				<gen:value>13113020002</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="地区計画">
				<gen:value>道玄坂二丁目地区</gen:value>
			</gen:stringAttribute>
			<bldg:class codeSpace="../../codelists/Building_class.xml">3002</bldg:class>
			<bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
			<bldg:measuredHeight uom="m">33.4</bldg:measuredHeight>
			<bldg:storeysAboveGround>9</bldg:storeysAboveGround>
			<bldg:storeysBelowGround>1</bldg:storeysBelowGround>
			<bldg:lod0RoofEdge>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.65898592059253 139.69839308147152 0 35.658979093123506 139.69839669352442 0 35.65898914657988 139.69842362564398 0 35.659091658571896 139.6983661422802 0 35.65907066315204 139.69829162590673 0 35.65897645044598 139.6983461574982 0 35.65899151339093 139.6983800061996 0 35.6589825942324 139.6983839752029 0 35.65898592059253 139.69839308147152 0</gml:posList>
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
											<gml:posList>35.65898592059253 139.69839308147152 18.8 35.6589825942324 139.6983839752029 18.8 35.65899151339093 139.6983800061996 18.8 35.65897645044598 139.6983461574982 18.8 35.65907066315204 139.69829162590673 18.8 35.659091658571896 139.6983661422802 18.8 35.65898914657988 139.69842362564398 18.8 35.658979093123506 139.69839669352442 18.8 35.65898592059253 139.69839308147152 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65898592059253 139.69839308147152 18.8 35.658979093123506 139.69839669352442 18.8 35.658979093123506 139.69839669352442 52.2 35.65898592059253 139.69839308147152 52.2 35.65898592059253 139.69839308147152 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658979093123506 139.69839669352442 18.8 35.65898914657988 139.69842362564398 18.8 35.65898914657988 139.69842362564398 52.2 35.658979093123506 139.69839669352442 52.2 35.658979093123506 139.69839669352442 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65898914657988 139.69842362564398 18.8 35.659091658571896 139.6983661422802 18.8 35.659091658571896 139.6983661422802 52.2 35.65898914657988 139.69842362564398 52.2 35.65898914657988 139.69842362564398 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659091658571896 139.6983661422802 18.8 35.65907066315204 139.69829162590673 18.8 35.65907066315204 139.69829162590673 52.2 35.659091658571896 139.6983661422802 52.2 35.659091658571896 139.6983661422802 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65907066315204 139.69829162590673 18.8 35.65897645044598 139.6983461574982 18.8 35.65897645044598 139.6983461574982 52.2 35.65907066315204 139.69829162590673 52.2 35.65907066315204 139.69829162590673 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65897645044598 139.6983461574982 18.8 35.65899151339093 139.6983800061996 18.8 35.65899151339093 139.6983800061996 52.2 35.65897645044598 139.6983461574982 52.2 35.65897645044598 139.6983461574982 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65899151339093 139.6983800061996 18.8 35.6589825942324 139.6983839752029 18.8 35.6589825942324 139.6983839752029 52.2 35.65899151339093 139.6983800061996 52.2 35.65899151339093 139.6983800061996 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.6589825942324 139.6983839752029 18.8 35.65898592059253 139.69839308147152 18.8 35.65898592059253 139.69839308147152 52.2 35.6589825942324 139.6983839752029 52.2 35.6589825942324 139.6983839752029 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65898592059253 139.69839308147152 52.2 35.658979093123506 139.69839669352442 52.2 35.65898914657988 139.69842362564398 52.2 35.659091658571896 139.6983661422802 52.2 35.65907066315204 139.69829162590673 52.2 35.65897645044598 139.6983461574982 52.2 35.65899151339093 139.6983800061996 52.2 35.6589825942324 139.6983839752029 52.2 35.65898592059253 139.69839308147152 52.2</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly-2381544a-5ab0-4f9e-8bfd-9a0a94ba8340"/>
							<gml:surfaceMember xlink:href="#poly-91b24afc-a5f5-41c2-8402-50b6fe60c20f"/>
							<gml:surfaceMember xlink:href="#poly-3600e810-ccc2-4206-a5bc-117cb0565667"/>
							<gml:surfaceMember xlink:href="#poly-ff326552-891e-448b-b0a0-8fb03791be6a"/>
							<gml:surfaceMember xlink:href="#poly-361ee6dd-8192-4ef7-9fe3-a8eec27ef064"/>
							<gml:surfaceMember xlink:href="#poly-c08fe704-9af6-4002-bac9-b5973f725475"/>
							<gml:surfaceMember xlink:href="#poly-3a543d18-8dcc-405f-a6f8-2b2e1c7598f4"/>
							<gml:surfaceMember xlink:href="#poly-62564ca9-decc-44eb-b078-c5ae1e41e8e8"/>
							<gml:surfaceMember xlink:href="#poly-9b3921ee-276d-4dee-a6b4-ef68a9a2978a"/>
							<gml:surfaceMember xlink:href="#poly-aa1cc90f-09b2-40be-bed9-d5c0df4374d9"/>
							<gml:surfaceMember xlink:href="#poly-375855ab-072d-4ead-b9a5-7416a1819960"/>
							<gml:surfaceMember xlink:href="#poly-cf1b7927-e314-4810-968c-bde3fa59e34e"/>
							<gml:surfaceMember xlink:href="#poly-ec9172ee-54eb-4050-a8b7-c0ce391894b7"/>
							<gml:surfaceMember xlink:href="#poly-2e5e5270-511f-488b-896d-e59df6457b23"/>
							<gml:surfaceMember xlink:href="#poly-af6faac7-6729-449e-af0e-8b07b7f71994"/>
							<gml:surfaceMember xlink:href="#poly-f77da335-f884-4578-a74f-c2797afa9a5c"/>
							<gml:surfaceMember xlink:href="#poly-63f8bf79-b1a9-45bc-83ef-bf58524fbdbf"/>
							<gml:surfaceMember xlink:href="#poly-bc39c059-f2ef-4ae4-ba55-5f4208faf8aa"/>
							<gml:surfaceMember xlink:href="#poly-6201cb6b-4e76-424c-954e-70a7894fea52"/>
							<gml:surfaceMember xlink:href="#poly-d8787e9c-5d1b-431e-8957-ba4ffa8574eb"/>
							<gml:surfaceMember xlink:href="#poly-537ee33c-d418-4f75-9e89-87b343b8091d"/>
							<gml:surfaceMember xlink:href="#poly-76481bdb-823d-4567-9495-039743817cc2"/>
							<gml:surfaceMember xlink:href="#poly-4644e7ab-27a1-4579-bc22-94e30fe1aa27"/>
							<gml:surfaceMember xlink:href="#poly-5aef2bef-18b1-49b2-8ed7-3bc1d655fe9a"/>
							<gml:surfaceMember xlink:href="#poly-fc05e243-4150-42fa-b0ed-2a95e27922c2"/>
							<gml:surfaceMember xlink:href="#poly-c3b3f62f-d87e-4001-96f6-55748d873ed8"/>
							<gml:surfaceMember xlink:href="#poly-68281db4-e366-4550-9d49-a0fb484d860a"/>
							<gml:surfaceMember xlink:href="#poly-64d1b1d7-a343-48c8-b154-03ba6c43e200"/>
							<gml:surfaceMember xlink:href="#poly-e7502605-cfe5-4205-a5d3-688c03fcda09"/>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod2Solid>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_15c46296-d449-4ea0-8c0a-0d1b6cb9ce73_BuildingInstallation_1060">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-17ad01af-2815-41fe-bb16-d525b4dc933b">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.658985921506286 139.69839309251466 18.86 35.65897909313588 139.69839670456906 18.86 35.65896310884399 139.69835387809385 18.86 35.658976449556995 139.69834616854436 18.86 35.6589915134033 139.69838001724426 18.86 35.65898259423239 139.6983839752029 18.86 35.658985921506286 139.69839309251466 18.86</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-1bc80126-bbbc-4957-9888-36fc026fea76">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-1bc80126-bbbc-4957-9888-36fc026fea76_0">
											<gml:posList>35.65896310884399 139.69835387809385 46.4 35.658976449556995 139.69834616854436 46.4 35.658976449556995 139.69834616854436 18.86 35.65896310884399 139.69835387809385 18.86 35.65896310884399 139.69835387809385 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-8cff7dc9-bfe2-4270-91df-6e32569f1aaf">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-8cff7dc9-bfe2-4270-91df-6e32569f1aaf_0">
											<gml:posList>35.65897909313588 139.69839670456906 46.4 35.65896310884399 139.69835387809385 46.4 35.65896310884399 139.69835387809385 18.86 35.65897909313588 139.69839670456906 18.86 35.65897909313588 139.69839670456906 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a33eb373-e1d1-4f07-8fe0-59fb2e885551">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-a33eb373-e1d1-4f07-8fe0-59fb2e885551_0">
											<gml:posList>35.6589915134033 139.69838001724426 46.4 35.658976449556995 139.69834616854436 46.4 35.65896310884399 139.69835387809385 46.4 35.65897909313588 139.69839670456906 46.4 35.658985921506286 139.69839309251466 46.4 35.65898259423239 139.6983839752029 46.4 35.6589915134033 139.69838001724426 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-cd82c0b1-3070-4f3e-8c2f-ed559398596d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-cd82c0b1-3070-4f3e-8c2f-ed559398596d_0">
											<gml:posList>35.658985921506286 139.69839309251466 46.4 35.65897909313588 139.69839670456906 46.4 35.65897909313588 139.69839670456906 18.86 35.658985921506286 139.69839309251466 18.86 35.658985921506286 139.69839309251466 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ca582d0c-f2ef-4bdc-bd58-037641717ba1">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ca582d0c-f2ef-4bdc-bd58-037641717ba1_0">
											<gml:posList>35.658976449556995 139.69834616854436 46.4 35.6589915134033 139.69838001724426 46.4 35.6589915134033 139.69838001724426 18.86 35.658976449556995 139.69834616854436 18.86 35.658976449556995 139.69834616854436 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-0c953e9b-70be-475d-bdae-b1efa3f35238">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-0c953e9b-70be-475d-bdae-b1efa3f35238_0">
											<gml:posList>35.65898259423239 139.6983839752029 46.4 35.658985921506286 139.69839309251466 46.4 35.658985921506286 139.69839309251466 18.86 35.65898259423239 139.6983839752029 18.86 35.65898259423239 139.6983839752029 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-4f1e69fb-8c59-40e4-86db-7dd323d2c25c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-4f1e69fb-8c59-40e4-86db-7dd323d2c25c_0">
											<gml:posList>35.6589915134033 139.69838001724426 46.4 35.65898259423239 139.6983839752029 46.4 35.65898259423239 139.6983839752029 18.86 35.6589915134033 139.69838001724426 18.86 35.6589915134033 139.69838001724426 46.4</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:boundedBy>
				<bldg:GroundSurface gml:id="surface-2381544a-5ab0-4f9e-8bfd-9a0a94ba8340">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-2381544a-5ab0-4f9e-8bfd-9a0a94ba8340">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-2381544a-5ab0-4f9e-8bfd-9a0a94ba8340">
											<gml:posList>35.6589859214939 139.69839308147002 18.808 35.65898259423239 139.6983839752029 18.808 35.65899151339092 139.6983800061996 18.808 35.65897644954462 139.6983461574997 18.808 35.65907066315204 139.69829162590673 18.808 35.65909165857189 139.6983661422802 18.808 35.65898914657988 139.69842362564398 18.808 35.658979093123506 139.69839669352442 18.808 35.6589859214939 139.69839308147002 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:GroundSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-ff326552-891e-448b-b0a0-8fb03791be6a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-ff326552-891e-448b-b0a0-8fb03791be6a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-ff326552-891e-448b-b0a0-8fb03791be6a">
											<gml:posList>35.6589859214939 139.69839308147002 49.9 35.65898744561811 139.69839379681048 49.9 35.65898414550921 139.69838478989965 49.9 35.65898259423239 139.6983839752029 49.9 35.6589859214939 139.69839308147002 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-aa1cc90f-09b2-40be-bed9-d5c0df4374d9">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-aa1cc90f-09b2-40be-bed9-d5c0df4374d9">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-aa1cc90f-09b2-40be-bed9-d5c0df4374d9">
											<gml:posList>35.65908919637634 139.69836485419341 52.247 35.65906951317238 139.6982949964752 52.247 35.65897919096786 139.69834726839926 52.247 35.659007439031306 139.69841071677132 52.247 35.65908919637634 139.69836485419341 52.247</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-375855ab-072d-4ead-b9a5-7416a1819960">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-375855ab-072d-4ead-b9a5-7416a1819960">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-375855ab-072d-4ead-b9a5-7416a1819960">
											<gml:posList>35.65909165857189 139.6983661422802 57.7 35.65908919637634 139.69836485419341 57.7 35.659007439031306 139.69841071677132 57.7 35.65900657724007 139.69841386595692 57.7 35.65909165857189 139.6983661422802 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-3a543d18-8dcc-405f-a6f8-2b2e1c7598f4">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3a543d18-8dcc-405f-a6f8-2b2e1c7598f4">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3a543d18-8dcc-405f-a6f8-2b2e1c7598f4">
											<gml:posList>35.65898914657988 139.69842362564398 49.9 35.65898971237839 139.69842178022986 49.9 35.65898061726005 139.69839741990955 49.9 35.658979093123506 139.69839669352442 49.9 35.65898914657988 139.69842362564398 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-cf1b7927-e314-4810-968c-bde3fa59e34e">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-cf1b7927-e314-4810-968c-bde3fa59e34e">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-cf1b7927-e314-4810-968c-bde3fa59e34e">
											<gml:posList>35.65909165857189 139.6983661422802 57.7 35.65907066315204 139.69829162590673 57.7 35.65906951317238 139.6982949964752 57.7 35.65908919637634 139.69836485419341 57.7 35.65909165857189 139.6983661422802 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-91b24afc-a5f5-41c2-8402-50b6fe60c20f">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-91b24afc-a5f5-41c2-8402-50b6fe60c20f">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-91b24afc-a5f5-41c2-8402-50b6fe60c20f">
											<gml:posList>35.65900657724007 139.69841386595692 57.7 35.659007439031306 139.69841071677132 57.7 35.65897919096786 139.69834726839926 57.7 35.65897644954462 139.6983461574997 57.7 35.65900657724007 139.69841386595692 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-c08fe704-9af6-4002-bac9-b5973f725475">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-c08fe704-9af6-4002-bac9-b5973f725475">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-c08fe704-9af6-4002-bac9-b5973f725475">
											<gml:posList>35.65898744561811 139.69839379681048 49.745 35.65898061726005 139.69839741990955 49.745 35.65898971237839 139.69842178022986 49.745 35.65900598986301 139.6984125415824 49.745 35.658991983292864 139.69838106569884 49.745 35.65898414550921 139.69838478989965 49.745 35.65898744561811 139.69839379681048 49.745</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-3600e810-ccc2-4206-a5bc-117cb0565667">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3600e810-ccc2-4206-a5bc-117cb0565667">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3600e810-ccc2-4206-a5bc-117cb0565667">
											<gml:posList>35.65898414550921 139.69838478989965 49.9 35.658991983292864 139.69838106569884 49.9 35.65899151339092 139.6983800061996 49.9 35.65898259423239 139.6983839752029 49.9 35.65898414550921 139.69838478989965 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-361ee6dd-8192-4ef7-9fe3-a8eec27ef064">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-361ee6dd-8192-4ef7-9fe3-a8eec27ef064">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-361ee6dd-8192-4ef7-9fe3-a8eec27ef064">
											<gml:posList>35.6589859214939 139.69839308147002 49.9 35.658979093123506 139.69839669352442 49.9 35.65898061726005 139.69839741990955 49.9 35.65898744561811 139.69839379681048 49.9 35.6589859214939 139.69839308147002 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-9b3921ee-276d-4dee-a6b4-ef68a9a2978a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-9b3921ee-276d-4dee-a6b4-ef68a9a2978a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-9b3921ee-276d-4dee-a6b4-ef68a9a2978a">
											<gml:posList>35.65897644954462 139.6983461574997 57.7 35.65897919096786 139.69834726839926 57.7 35.65906951317238 139.6982949964752 57.7 35.65907066315204 139.69829162590673 57.7 35.65897644954462 139.6983461574997 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-62564ca9-decc-44eb-b078-c5ae1e41e8e8">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-62564ca9-decc-44eb-b078-c5ae1e41e8e8">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-62564ca9-decc-44eb-b078-c5ae1e41e8e8">
											<gml:posList>35.65898971237839 139.69842178022986 49.9 35.65898914657988 139.69842362564398 49.9 35.65900657724007 139.69841386595692 49.9 35.65900598986301 139.6984125415824 49.9 35.65898971237839 139.69842178022986 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-d8787e9c-5d1b-431e-8957-ba4ffa8574eb">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-d8787e9c-5d1b-431e-8957-ba4ffa8574eb">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-d8787e9c-5d1b-431e-8957-ba4ffa8574eb">
											<gml:posList>35.65899151339092 139.6983800061996 18.808 35.65898259423239 139.6983839752029 18.808 35.65898259423239 139.6983839752029 49.9 35.65899151339092 139.6983800061996 49.9 35.65899151339092 139.6983800061996 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f77da335-f884-4578-a74f-c2797afa9a5c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f77da335-f884-4578-a74f-c2797afa9a5c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f77da335-f884-4578-a74f-c2797afa9a5c">
											<gml:posList>35.658979093123506 139.69839669352442 18.808 35.65898914657988 139.69842362564398 18.808 35.65898914657988 139.69842362564398 49.9 35.658979093123506 139.69839669352442 49.9 35.658979093123506 139.69839669352442 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-bc39c059-f2ef-4ae4-ba55-5f4208faf8aa">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-bc39c059-f2ef-4ae4-ba55-5f4208faf8aa">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-bc39c059-f2ef-4ae4-ba55-5f4208faf8aa">
											<gml:posList>35.65898971237839 139.69842178022986 49.9 35.65898971237839 139.69842178022986 49.745 35.65898061726005 139.69839741990955 49.745 35.65898061726005 139.69839741990955 49.9 35.65898971237839 139.69842178022986 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-ec9172ee-54eb-4050-a8b7-c0ce391894b7">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-ec9172ee-54eb-4050-a8b7-c0ce391894b7">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-ec9172ee-54eb-4050-a8b7-c0ce391894b7">
											<gml:posList>35.65898061726005 139.69839741990955 49.9 35.65898061726005 139.69839741990955 49.745 35.65898744561811 139.69839379681048 49.745 35.65898744561811 139.69839379681048 49.9 35.65898061726005 139.69839741990955 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-76481bdb-823d-4567-9495-039743817cc2">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-76481bdb-823d-4567-9495-039743817cc2">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-76481bdb-823d-4567-9495-039743817cc2">
											<gml:posList>35.659007439031306 139.69841071677132 57.7 35.659007439031306 139.69841071677132 52.247 35.65897919096786 139.69834726839926 52.247 35.65897919096786 139.69834726839926 57.7 35.659007439031306 139.69841071677132 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-64d1b1d7-a343-48c8-b154-03ba6c43e200">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-64d1b1d7-a343-48c8-b154-03ba6c43e200">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-64d1b1d7-a343-48c8-b154-03ba6c43e200">
											<gml:posList>35.65906951317238 139.6982949964752 57.7 35.65906951317238 139.6982949964752 52.247 35.65908919637634 139.69836485419341 52.247 35.65908919637634 139.69836485419341 57.7 35.65906951317238 139.6982949964752 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-5aef2bef-18b1-49b2-8ed7-3bc1d655fe9a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-5aef2bef-18b1-49b2-8ed7-3bc1d655fe9a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-5aef2bef-18b1-49b2-8ed7-3bc1d655fe9a">
											<gml:posList>35.65907066315204 139.69829162590673 18.808 35.65897644954462 139.6983461574997 18.808 35.65897644954462 139.6983461574997 57.7 35.65907066315204 139.69829162590673 57.7 35.65907066315204 139.69829162590673 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-fc05e243-4150-42fa-b0ed-2a95e27922c2">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fc05e243-4150-42fa-b0ed-2a95e27922c2">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fc05e243-4150-42fa-b0ed-2a95e27922c2">
											<gml:posList>35.65897919096786 139.69834726839926 57.7 35.65897919096786 139.69834726839926 52.247 35.65906951317238 139.6982949964752 52.247 35.65906951317238 139.6982949964752 57.7 35.65897919096786 139.69834726839926 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-e7502605-cfe5-4205-a5d3-688c03fcda09">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-e7502605-cfe5-4205-a5d3-688c03fcda09">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-e7502605-cfe5-4205-a5d3-688c03fcda09">
											<gml:posList>35.65909165857189 139.6983661422802 18.808 35.65907066315204 139.69829162590673 18.808 35.65907066315204 139.69829162590673 57.7 35.65909165857189 139.6983661422802 57.7 35.65909165857189 139.6983661422802 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-2e5e5270-511f-488b-896d-e59df6457b23">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-2e5e5270-511f-488b-896d-e59df6457b23">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-2e5e5270-511f-488b-896d-e59df6457b23">
											<gml:posList>35.65898414550921 139.69838478989965 49.9 35.65898414550921 139.69838478989965 49.745 35.658991983292864 139.69838106569884 49.745 35.658991983292864 139.69838106569884 49.9 35.65898414550921 139.69838478989965 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-af6faac7-6729-449e-af0e-8b07b7f71994">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-af6faac7-6729-449e-af0e-8b07b7f71994">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-af6faac7-6729-449e-af0e-8b07b7f71994">
											<gml:posList>35.6589859214939 139.69839308147002 18.808 35.658979093123506 139.69839669352442 18.808 35.658979093123506 139.69839669352442 49.9 35.6589859214939 139.69839308147002 49.9 35.6589859214939 139.69839308147002 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-537ee33c-d418-4f75-9e89-87b343b8091d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-537ee33c-d418-4f75-9e89-87b343b8091d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-537ee33c-d418-4f75-9e89-87b343b8091d">
											<gml:posList>35.65897644954462 139.6983461574997 57.7 35.65897644954462 139.6983461574997 18.808 35.65899151339092 139.6983800061996 18.808 35.65899151339092 139.6983800061996 49.9 35.658991983292864 139.69838106569884 49.9 35.658991983292864 139.69838106569884 49.745 35.65900598986301 139.6984125415824 49.745 35.65900598986301 139.6984125415824 49.9 35.65900657724007 139.69841386595692 49.9 35.65900657724007 139.69841386595692 57.7 35.65897644954462 139.6983461574997 57.7</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-6201cb6b-4e76-424c-954e-70a7894fea52">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-6201cb6b-4e76-424c-954e-70a7894fea52">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-6201cb6b-4e76-424c-954e-70a7894fea52">
											<gml:posList>35.65898744561811 139.69839379681048 49.9 35.65898744561811 139.69839379681048 49.745 35.65898414550921 139.69838478989965 49.745 35.65898414550921 139.69838478989965 49.9 35.65898744561811 139.69839379681048 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-c3b3f62f-d87e-4001-96f6-55748d873ed8">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-c3b3f62f-d87e-4001-96f6-55748d873ed8">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-c3b3f62f-d87e-4001-96f6-55748d873ed8">
											<gml:posList>35.65909165857189 139.6983661422802 18.808 35.65909165857189 139.6983661422802 57.7 35.65900657724007 139.69841386595692 57.7 35.65900657724007 139.69841386595692 49.9 35.65898914657988 139.69842362564398 49.9 35.65898914657988 139.69842362564398 18.808 35.65909165857189 139.6983661422802 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-4644e7ab-27a1-4579-bc22-94e30fe1aa27">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-4644e7ab-27a1-4579-bc22-94e30fe1aa27">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-4644e7ab-27a1-4579-bc22-94e30fe1aa27">
											<gml:posList>35.65900598986301 139.6984125415824 49.9 35.65900598986301 139.6984125415824 49.745 35.65898971237839 139.69842178022986 49.745 35.65898971237839 139.69842178022986 49.9 35.65900598986301 139.6984125415824 49.9</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-63f8bf79-b1a9-45bc-83ef-bf58524fbdbf">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-63f8bf79-b1a9-45bc-83ef-bf58524fbdbf">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-63f8bf79-b1a9-45bc-83ef-bf58524fbdbf">
											<gml:posList>35.65898259423239 139.6983839752029 18.808 35.6589859214939 139.69839308147002 18.808 35.6589859214939 139.69839308147002 49.9 35.65898259423239 139.6983839752029 49.9 35.65898259423239 139.6983839752029 18.808</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-68281db4-e366-4550-9d49-a0fb484d860a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-68281db4-e366-4550-9d49-a0fb484d860a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-68281db4-e366-4550-9d49-a0fb484d860a">
											<gml:posList>35.65908919637634 139.69836485419341 57.7 35.65908919637634 139.69836485419341 52.247 35.659007439031306 139.69841071677132 52.247 35.659007439031306 139.69841071677132 57.7 35.65908919637634 139.69836485419341 57.7</gml:posList>
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
									<xAL:LocalityName Type="Town">東京都渋谷区道玄坂二丁目</xAL:LocalityName>
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
					<uro:depth uom="m">0.024</uro:depth>
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
					<uro:buildingRoofEdgeArea uom="m2">0.90251</uro:buildingRoofEdgeArea>
					<uro:fireproofStructureType codeSpace="../../codelists/BuildingDetailAttribute_fireproofStructureType.xml">1001</uro:fireproofStructureType>
					<uro:urbanPlanType codeSpace="../../codelists/Common_urbanPlanType.xml">21</uro:urbanPlanType>
					<uro:areaClassificationType codeSpace="../../codelists/Common_areaClassificationType.xml">22</uro:areaClassificationType>
					<uro:districtsAndZonesType codeSpace="../../codelists/Common_districtsAndZonesType.xml">10</uro:districtsAndZonesType>
					<uro:landUseType codeSpace="../../codelists/Common_landUseType.xml">212</uro:landUseType>
					<uro:detailedUsage codeSpace="../../codelists/BuildingDetailAttribute_detailedUsage.xml">1210</uro:detailedUsage>
					<uro:specifiedBuildingCoverageRate>80</uro:specifiedBuildingCoverageRate>
					<uro:specifiedFloorAreaRate>800</uro:specifiedFloorAreaRate>
					<uro:surveyYear>2021</uro:surveyYear>
				</uro:BuildingDetailAttribute>
			</uro:buildingDetailAttribute>
			<uro:buildingIDAttribute>
				<uro:BuildingIDAttribute>
					<uro:buildingID>13113-bldg-2416</uro:buildingID>
					<uro:prefecture codeSpace="../../codelists/Common_localPublicAuthorities.xml">13</uro:prefecture>
					<uro:city codeSpace="../../codelists/Common_localPublicAuthorities.xml">13113</uro:city>
				</uro:BuildingIDAttribute>
			</uro:buildingIDAttribute>
		</bldg:Building>
	</core:cityObjectMember>
	<core:cityObjectMember>
		<bldg:Building gml:id="bldg_c6b87c62-983d-4f80-a77f-94e341f747b8">
			<core:creationDate>2024-03-15</core:creationDate>
			<gen:stringAttribute name="延べ面積換算係数">
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="説明注記">
				<gen:value> </gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="大字・町コード">
				<gen:value>20</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="町・丁目コード">
				<gen:value>2</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="13+区市町村コード+大字・町コード+町・丁目コード">
				<gen:value>13113020002</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="地区計画">
				<gen:value>道玄坂二丁目地区</gen:value>
			</gen:stringAttribute>
			<bldg:class codeSpace="../../codelists/Building_class.xml">3002</bldg:class>
			<bldg:usage codeSpace="../../codelists/Building_usage.xml">402</bldg:usage>
			<bldg:measuredHeight uom="m">27.1</bldg:measuredHeight>
			<bldg:storeysAboveGround>8</bldg:storeysAboveGround>
			<bldg:storeysBelowGround>1</bldg:storeysBelowGround>
			<bldg:lod0RoofEdge>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.65901868919636 139.69864514346907 0 35.659122491369246 139.69858865222292 0 35.659112156756855 139.69856014111787 0 35.659142577643735 139.69854358921214 0 35.65913464241407 139.69851582511288 0 35.65899104999043 139.6985940529857 0 35.65901868919636 139.69864514346907 0</gml:posList>
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
											<gml:posList>35.65901868919636 139.69864514346907 18.2 35.65899104999043 139.6985940529857 18.2 35.65913464241407 139.69851582511288 18.2 35.659142577643735 139.69854358921214 18.2 35.659112156756855 139.69856014111787 18.2 35.659122491369246 139.69858865222292 18.2 35.65901868919636 139.69864514346907 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65901868919636 139.69864514346907 18.2 35.659122491369246 139.69858865222292 18.2 35.659122491369246 139.69858865222292 45.3 35.65901868919636 139.69864514346907 45.3 35.65901868919636 139.69864514346907 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659122491369246 139.69858865222292 18.2 35.659112156756855 139.69856014111787 18.2 35.659112156756855 139.69856014111787 45.3 35.659122491369246 139.69858865222292 45.3 35.659122491369246 139.69858865222292 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659112156756855 139.69856014111787 18.2 35.659142577643735 139.69854358921214 18.2 35.659142577643735 139.69854358921214 45.3 35.659112156756855 139.69856014111787 45.3 35.659112156756855 139.69856014111787 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659142577643735 139.69854358921214 18.2 35.65913464241407 139.69851582511288 18.2 35.65913464241407 139.69851582511288 45.3 35.659142577643735 139.69854358921214 45.3 35.659142577643735 139.69854358921214 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65913464241407 139.69851582511288 18.2 35.65899104999043 139.6985940529857 18.2 35.65899104999043 139.6985940529857 45.3 35.65913464241407 139.69851582511288 45.3 35.65913464241407 139.69851582511288 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65899104999043 139.6985940529857 18.2 35.65901868919636 139.69864514346907 18.2 35.65901868919636 139.69864514346907 45.3 35.65899104999043 139.6985940529857 45.3 35.65899104999043 139.6985940529857 18.2</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65901868919636 139.69864514346907 45.3 35.659122491369246 139.69858865222292 45.3 35.659112156756855 139.69856014111787 45.3 35.659142577643735 139.69854358921214 45.3 35.65913464241407 139.69851582511288 45.3 35.65899104999043 139.6985940529857 45.3 35.65901868919636 139.69864514346907 45.3</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly-9034ee7f-3d92-429c-afa0-7a790037134a"/>
							<gml:surfaceMember xlink:href="#poly-396e2ce8-01fe-4fe0-9288-1433690c7de1"/>
							<gml:surfaceMember xlink:href="#poly-b5eeef9f-aaab-4759-80b7-9beafdbd769d"/>
							<gml:surfaceMember xlink:href="#poly-28317eaf-aeef-404d-b7e4-4806e5d99b86"/>
							<gml:surfaceMember xlink:href="#poly-f880dbd3-7b6b-43fd-94c8-534e12b7f5aa"/>
							<gml:surfaceMember xlink:href="#poly-373cae05-5c4d-4f03-bcb5-61c94f70051c"/>
							<gml:surfaceMember xlink:href="#poly-fdacdca5-714e-4f8f-90eb-fffd0f236a5c"/>
							<gml:surfaceMember xlink:href="#poly-19f02cda-a8a0-4e21-8885-590012c2061a"/>
							<gml:surfaceMember xlink:href="#poly-f4f645e9-3474-46f9-975e-7ddee569d73f"/>
							<gml:surfaceMember xlink:href="#poly-22efc8a2-6296-4c18-86ef-5ecb1427c2a1"/>
							<gml:surfaceMember xlink:href="#poly-4f7ef37f-c854-4219-ba49-9904f7e015df"/>
							<gml:surfaceMember xlink:href="#poly-42624702-3a19-4dbf-b250-70978da06ba1"/>
							<gml:surfaceMember xlink:href="#poly-050da39d-9df6-4675-93c2-70fcd91a8ebd"/>
							<gml:surfaceMember xlink:href="#poly-074414ca-908f-4499-97d6-c4d84e87db0c"/>
							<gml:surfaceMember xlink:href="#poly-3644dd46-b0ae-42a2-a70d-bf875b9afac2"/>
							<gml:surfaceMember xlink:href="#poly-e1ca4f73-6fe7-4d54-9eee-799470b7a432"/>
							<gml:surfaceMember xlink:href="#poly-deed6cda-b2c7-429f-a4c7-71a27390b2b4"/>
							<gml:surfaceMember xlink:href="#poly-4a8edaa3-cacb-44f2-a428-74573b5c743c"/>
							<gml:surfaceMember xlink:href="#poly-eea14073-435e-4056-9742-b54e9c027cc9"/>
							<gml:surfaceMember xlink:href="#poly-3e015549-2a07-4cb7-9307-ab013c45bed0"/>
							<gml:surfaceMember xlink:href="#poly-589e39ac-1b03-475b-87e8-92ad19ab7335"/>
							<gml:surfaceMember xlink:href="#poly-0012c016-4140-482d-bb7c-e90eb7b26562"/>
							<gml:surfaceMember xlink:href="#poly-437708b8-54f5-4970-bb5c-cca43ff799fa"/>
							<gml:surfaceMember xlink:href="#poly-c0a4826e-c74e-4b34-af47-76d0dc036f75"/>
							<gml:surfaceMember xlink:href="#poly-b70af752-aa1f-4b1e-a599-c047054b663b"/>
							<gml:surfaceMember xlink:href="#poly-f2d2d9f8-ecaf-4ea5-a025-ab9ba42325e7"/>
							<gml:surfaceMember xlink:href="#poly-3c4fefbe-541a-46f8-98f4-30cf2634a524"/>
							<gml:surfaceMember xlink:href="#poly-4adade3f-bca5-4614-8ff4-f6dcd8c2cde4"/>
							<gml:surfaceMember xlink:href="#poly-aead2f97-c02d-4858-a806-1267a0593890"/>
							<gml:surfaceMember xlink:href="#poly-7cb0bb78-d760-4610-af24-c887ca3d1c0f"/>
							<gml:surfaceMember xlink:href="#poly-fd07f5d0-f820-45a2-acce-236c8cf21356"/>
							<gml:surfaceMember xlink:href="#poly-d7e10054-ef5e-4358-add7-141783df3905"/>
							<gml:surfaceMember xlink:href="#poly-8cacc81a-2dd2-40ce-9e3e-b607d1c7ad08"/>
							<gml:surfaceMember xlink:href="#poly-1cb663c0-b8fb-416d-a0dc-5c8a0f4455fb"/>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod2Solid>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_c6b87c62-983d-4f80-a77f-94e341f747b8_BuildingInstallation_1041">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-c85b5a46-309b-4410-a811-da9be7782db8">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65905684656243 139.69856652952788 44.781 35.65906533880193 139.69859185179183 44.781 35.65904051089753 139.698604340867 44.781 35.65903200965925 139.6985790296694 44.781 35.65905684656243 139.69856652952788 44.781</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-d72762f7-240b-4ae2-bac0-d4b83bfe997d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-d72762f7-240b-4ae2-bac0-d4b83bfe997d_0">
											<gml:posList>35.65903200965925 139.6985790296694 48.346 35.65903200965925 139.6985790296694 44.781 35.65904051089753 139.698604340867 44.781 35.65904051089753 139.698604340867 48.346 35.65903200965925 139.6985790296694 48.346</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-7cfb1c38-ece6-4e76-858d-327b27bff17a">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-7cfb1c38-ece6-4e76-858d-327b27bff17a_0">
											<gml:posList>35.65905684656243 139.69856652952788 48.346 35.65905684656243 139.69856652952788 44.781 35.65903200965925 139.6985790296694 44.781 35.65903200965925 139.6985790296694 48.346 35.65905684656243 139.69856652952788 48.346</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-877c95bb-656b-4f13-beb1-a6c6b1251556">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-877c95bb-656b-4f13-beb1-a6c6b1251556_0">
											<gml:posList>35.65905684656243 139.69856652952788 48.346 35.65903200965925 139.6985790296694 48.346 35.65904051089753 139.698604340867 48.346 35.65906533880193 139.69859185179183 48.346 35.65905684656243 139.69856652952788 48.346</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-76948bea-c4dc-4d4a-8e98-4df74ffcf609">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-76948bea-c4dc-4d4a-8e98-4df74ffcf609_0">
											<gml:posList>35.65904051089753 139.698604340867 48.346 35.65904051089753 139.698604340867 44.781 35.65906533880193 139.69859185179183 44.781 35.65906533880193 139.69859185179183 48.346 35.65904051089753 139.698604340867 48.346</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-15186546-520d-4295-a61b-f0053664e5a9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-15186546-520d-4295-a61b-f0053664e5a9_0">
											<gml:posList>35.65906533880193 139.69859185179183 48.346 35.65906533880193 139.69859185179183 44.781 35.65905684656243 139.69856652952788 44.781 35.65905684656243 139.69856652952788 48.346 35.65906533880193 139.69859185179183 48.346</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_c6b87c62-983d-4f80-a77f-94e341f747b8_BuildingInstallation_1070">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-50d2f31c-7950-4157-acb7-b046742fea4f">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.6590954756951 139.69857121384595 48.377 35.659099526166194 139.69858221860719 48.377 35.65908261783148 139.69859156873778 48.377 35.65907856736125 139.6985805639784 48.377 35.6590954756951 139.69857121384595 48.377</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-bb5e26fa-3bb6-4fad-931d-5d52e5238fda">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-bb5e26fa-3bb6-4fad-931d-5d52e5238fda_0">
											<gml:posList>35.6590954756951 139.69857121384595 50.68 35.6590954756951 139.69857121384595 48.377 35.65907856736125 139.6985805639784 48.377 35.65907856736125 139.6985805639784 50.68 35.6590954756951 139.69857121384595 50.68</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-b64ccdff-1ed3-47bb-936a-579c3ad1d642">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-b64ccdff-1ed3-47bb-936a-579c3ad1d642_0">
											<gml:posList>35.659099526166194 139.69858221860719 50.68 35.659099526166194 139.69858221860719 48.377 35.6590954756951 139.69857121384595 48.377 35.6590954756951 139.69857121384595 50.68 35.659099526166194 139.69858221860719 50.68</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-01d303bd-c8fb-4c03-b4b7-e38914d00af8">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-01d303bd-c8fb-4c03-b4b7-e38914d00af8_0">
											<gml:posList>35.6590954756951 139.69857121384595 50.68 35.65907856736125 139.6985805639784 50.68 35.65908261783148 139.69859156873778 50.68 35.659099526166194 139.69858221860719 50.68 35.6590954756951 139.69857121384595 50.68</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-6f7dae05-b64b-41a4-8f6c-31b84f45cd66">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-6f7dae05-b64b-41a4-8f6c-31b84f45cd66_0">
											<gml:posList>35.65907856736125 139.6985805639784 50.68 35.65907856736125 139.6985805639784 48.377 35.65908261783148 139.69859156873778 48.377 35.65908261783148 139.69859156873778 50.68 35.65907856736125 139.6985805639784 50.68</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a32ef13b-e079-4da9-b9e5-fbee6c9a737a">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-a32ef13b-e079-4da9-b9e5-fbee6c9a737a_0">
											<gml:posList>35.65908261783148 139.69859156873778 50.68 35.65908261783148 139.69859156873778 48.377 35.659099526166194 139.69858221860719 48.377 35.659099526166194 139.69858221860719 50.68 35.65908261783148 139.69859156873778 50.68</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_c6b87c62-983d-4f80-a77f-94e341f747b8_BuildingInstallation_1060">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-599462c3-433d-4e90-bcd7-4da3995444a8">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65908977337771 139.6985500728275 44.781 35.659093824023756 139.69856123221237 44.781 35.65908806776277 139.69856437857865 44.781 35.659069672893715 139.69857438284623 44.781 35.65906561322278 139.69856321243452 44.781 35.65908977337771 139.6985500728275 44.781</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-b22634e9-cbbb-43ec-8f6c-926e9837f5e2">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65914257766845 139.6985436113015 18.21 35.65915102052687 139.69857313066188 18.21 35.6591224913816 139.69858866326757 18.21 35.65911215678157 139.69856016320722 18.21 35.65914257766845 139.6985436113015 18.21</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ef4fe090-3538-4fc6-bb63-d9c0a2b34bf9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ef4fe090-3538-4fc6-bb63-d9c0a2b34bf9_0">
											<gml:posList>35.65906561322278 139.69856321243452 47.412 35.65906561322278 139.69856321243452 44.781 35.659069672893715 139.69857438284623 44.781 35.659069672893715 139.69857438284623 47.412 35.65906561322278 139.69856321243452 47.412</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-c53a8302-057e-4e6b-86a0-ed6fcfbfc1eb">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-c53a8302-057e-4e6b-86a0-ed6fcfbfc1eb_0">
											<gml:posList>35.65908977337771 139.6985500728275 44.781 35.65906561322278 139.69856321243452 44.781 35.65906561322278 139.69856321243452 47.412 35.65908977337771 139.6985500728275 47.412 35.65908977337771 139.6985500728275 44.781</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-d2d1055d-d309-4fae-b787-613a5ad67813">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-d2d1055d-d309-4fae-b787-613a5ad67813_0">
											<gml:posList>35.659069672893715 139.69857438284623 47.412 35.659069672893715 139.69857438284623 44.781 35.65908806776277 139.69856437857865 44.781 35.65908806776277 139.69856437857865 47.412 35.659069672893715 139.69857438284623 47.412</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e2e8fa85-f99b-4b31-8e30-be2c9ed13799">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e2e8fa85-f99b-4b31-8e30-be2c9ed13799_0">
											<gml:posList>35.65908977337771 139.6985500728275 47.412 35.65906561322278 139.69856321243452 47.412 35.659069672893715 139.69857438284623 47.412 35.65908806776277 139.69856437857865 47.412 35.659093824023756 139.69856123221237 47.412 35.65908977337771 139.6985500728275 47.412</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-44e37660-e10b-4e7c-b615-2a8ba439a8a1">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-44e37660-e10b-4e7c-b615-2a8ba439a8a1_0">
											<gml:posList>35.65908806776277 139.69856437857865 47.412 35.65908806776277 139.69856437857865 44.781 35.659093824023756 139.69856123221237 44.781 35.659093824023756 139.69856123221237 47.412 35.65908806776277 139.69856437857865 47.412</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-6c16b08d-d7d2-4516-84d3-d2209824e79b">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-6c16b08d-d7d2-4516-84d3-d2209824e79b_0">
											<gml:posList>35.659093824023756 139.69856123221237 47.412 35.659093824023756 139.69856123221237 44.781 35.65908977337771 139.6985500728275 44.781 35.65908977337771 139.6985500728275 47.412 35.659093824023756 139.69856123221237 47.412</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-58e3acd8-ceb9-4012-af90-82f9020a3758">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-58e3acd8-ceb9-4012-af90-82f9020a3758_0">
											<gml:posList>35.6591224913816 139.69858866326757 45.1 35.65911215678157 139.69856016320722 45.1 35.65911215678157 139.69856016320722 18.21 35.6591224913816 139.69858866326757 18.21 35.6591224913816 139.69858866326757 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-1e45b78d-4398-4384-8941-3df72e95c740">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-1e45b78d-4398-4384-8941-3df72e95c740_0">
											<gml:posList>35.65911215678157 139.69856016320722 45.1 35.65914257766845 139.6985436113015 45.1 35.65914257766845 139.6985436113015 18.21 35.65911215678157 139.69856016320722 18.21 35.65911215678157 139.69856016320722 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-5ee18bc3-1947-4832-872a-df382e42fd19">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-5ee18bc3-1947-4832-872a-df382e42fd19_0">
											<gml:posList>35.65915102052687 139.69857313066188 45.1 35.65914257766845 139.6985436113015 45.1 35.65911215678157 139.69856016320722 45.1 35.6591224913816 139.69858866326757 45.1 35.65915102052687 139.69857313066188 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-405f7519-25da-416c-aff9-7e01af008fe7">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-405f7519-25da-416c-aff9-7e01af008fe7_0">
											<gml:posList>35.65915102052687 139.69857313066188 45.1 35.6591224913816 139.69858866326757 45.1 35.6591224913816 139.69858866326757 18.21 35.65915102052687 139.69857313066188 18.21 35.65915102052687 139.69857313066188 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-efcef139-b9b5-4f86-b4b6-d6e09a6e1646">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-efcef139-b9b5-4f86-b4b6-d6e09a6e1646_0">
											<gml:posList>35.65914257766845 139.6985436113015 45.1 35.65915102052687 139.69857313066188 45.1 35.65915102052687 139.69857313066188 18.21 35.65914257766845 139.6985436113015 18.21 35.65914257766845 139.6985436113015 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:boundedBy>
				<bldg:GroundSurface gml:id="surface-9034ee7f-3d92-429c-afa0-7a790037134a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-9034ee7f-3d92-429c-afa0-7a790037134a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-9034ee7f-3d92-429c-afa0-7a790037134a">
											<gml:posList>35.658991049990426 139.6985940529857 18.19 35.659134641512686 139.6985158251144 18.19 35.65914257764372 139.69854358921214 18.19 35.65911215675685 139.69856014111787 18.19 35.659122491369246 139.6985886522229 18.19 35.659018689196365 139.69864514346907 18.19 35.658991049990426 139.6985940529857 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:GroundSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-28317eaf-aeef-404d-b7e4-4806e5d99b86">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-28317eaf-aeef-404d-b7e4-4806e5d99b86">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-28317eaf-aeef-404d-b7e4-4806e5d99b86">
											<gml:posList>35.658991049990426 139.6985940529857 45.1 35.65899336744496 139.69859487744424 45.1 35.65913372501817 139.69851842216056 45.1 35.659134641512686 139.6985158251144 45.1 35.658991049990426 139.6985940529857 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-19f02cda-a8a0-4e21-8885-590012c2061a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-19f02cda-a8a0-4e21-8885-590012c2061a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-19f02cda-a8a0-4e21-8885-590012c2061a">
											<gml:posList>35.65911185024861 139.69859232589513 48.377 35.65910009610654 139.6985599073545 48.377 35.65907173813702 139.69857536235452 48.377 35.6590834922626 139.69860776984132 48.377 35.65911185024861 139.69859232589513 48.377</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-373cae05-5c4d-4f03-bcb5-61c94f70051c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-373cae05-5c4d-4f03-bcb5-61c94f70051c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-373cae05-5c4d-4f03-bcb5-61c94f70051c">
											<gml:posList>35.659082692882755 139.6986103114646 48.657 35.6590834922626 139.69860776984132 48.657 35.65907173813702 139.69857536235452 48.657 35.659069672893715 139.69857438284623 48.657 35.659082692882755 139.6986103114646 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-f880dbd3-7b6b-43fd-94c8-534e12b7f5aa">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f880dbd3-7b6b-43fd-94c8-534e12b7f5aa">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f880dbd3-7b6b-43fd-94c8-534e12b7f5aa">
											<gml:posList>35.65899336744496 139.69859487744424 44.781 35.659019254380645 139.6986427458224 44.781 35.6590820599697 139.69860856746533 44.781 35.659069672893715 139.69857438284623 44.781 35.659100904511405 139.69855737675974 44.781 35.65911329159218 139.69859156138946 44.781 35.65912042613842 139.69858768375835 44.781 35.65911009153814 139.69855918369885 44.781 35.659140620515444 139.69854256534327 44.781 35.65913372501817 139.69851842216056 44.781 35.65899336744496 139.69859487744424 44.781</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-fdacdca5-714e-4f8f-90eb-fffd0f236a5c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fdacdca5-714e-4f8f-90eb-fffd0f236a5c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fdacdca5-714e-4f8f-90eb-fffd0f236a5c">
											<gml:posList>35.659069672893715 139.69857438284623 48.657 35.65907173813702 139.69857536235452 48.657 35.65910009610654 139.6985599073545 48.657 35.659100904511405 139.69855737675974 48.657 35.659069672893715 139.69857438284623 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-4f7ef37f-c854-4219-ba49-9904f7e015df">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-4f7ef37f-c854-4219-ba49-9904f7e015df">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-4f7ef37f-c854-4219-ba49-9904f7e015df">
											<gml:posList>35.65911215675685 139.69856014111787 45.1 35.65911009153814 139.69855918369885 45.1 35.65912042613842 139.69858768375835 45.1 35.659122491369246 139.6985886522229 45.1 35.65911215675685 139.69856014111787 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-396e2ce8-01fe-4fe0-9288-1433690c7de1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-396e2ce8-01fe-4fe0-9288-1433690c7de1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-396e2ce8-01fe-4fe0-9288-1433690c7de1">
											<gml:posList>35.659018689196365 139.69864514346907 45.1 35.659019254380645 139.6986427458224 45.1 35.65899336744496 139.69859487744424 45.1 35.658991049990426 139.6985940529857 45.1 35.659018689196365 139.69864514346907 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-f4f645e9-3474-46f9-975e-7ddee569d73f">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f4f645e9-3474-46f9-975e-7ddee569d73f">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f4f645e9-3474-46f9-975e-7ddee569d73f">
											<gml:posList>35.65911392451784 139.69859331643394 48.657 35.65911185024861 139.69859232589513 48.657 35.6590834922626 139.69860776984132 48.657 35.659082692882755 139.6986103114646 48.657 35.65911392451784 139.69859331643394 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-42624702-3a19-4dbf-b250-70978da06ba1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-42624702-3a19-4dbf-b250-70978da06ba1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-42624702-3a19-4dbf-b250-70978da06ba1">
											<gml:posList>35.65912042613842 139.69858768375835 45.1 35.65911329159218 139.69859156138946 45.1 35.65911392451784 139.69859331643394 45.1 35.659122491369246 139.6985886522229 45.1 35.65912042613842 139.69858768375835 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-b5eeef9f-aaab-4759-80b7-9beafdbd769d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-b5eeef9f-aaab-4759-80b7-9beafdbd769d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-b5eeef9f-aaab-4759-80b7-9beafdbd769d">
											<gml:posList>35.659019254380645 139.6986427458224 45.1 35.659018689196365 139.69864514346907 45.1 35.659082692882755 139.6986103114646 45.1 35.6590820599697 139.69860856746533 45.1 35.659019254380645 139.6986427458224 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-074414ca-908f-4499-97d6-c4d84e87db0c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-074414ca-908f-4499-97d6-c4d84e87db0c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-074414ca-908f-4499-97d6-c4d84e87db0c">
											<gml:posList>35.65914257764372 139.69854358921214 45.1 35.659134641512686 139.6985158251144 45.1 35.65913372501817 139.69851842216056 45.1 35.659140620515444 139.69854256534327 45.1 35.65914257764372 139.69854358921214 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-22efc8a2-6296-4c18-86ef-5ecb1427c2a1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-22efc8a2-6296-4c18-86ef-5ecb1427c2a1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-22efc8a2-6296-4c18-86ef-5ecb1427c2a1">
											<gml:posList>35.659100904511405 139.69855737675974 48.657 35.65910009610654 139.6985599073545 48.657 35.65911185024861 139.69859232589513 48.657 35.65911392451784 139.69859331643394 48.657 35.659100904511405 139.69855737675974 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-050da39d-9df6-4675-93c2-70fcd91a8ebd">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-050da39d-9df6-4675-93c2-70fcd91a8ebd">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-050da39d-9df6-4675-93c2-70fcd91a8ebd">
											<gml:posList>35.65911215675685 139.69856014111787 45.1 35.65914257764372 139.69854358921214 45.1 35.659140620515444 139.69854256534327 45.1 35.65911009153814 139.69855918369885 45.1 35.65911215675685 139.69856014111787 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-c0a4826e-c74e-4b34-af47-76d0dc036f75">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-c0a4826e-c74e-4b34-af47-76d0dc036f75">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-c0a4826e-c74e-4b34-af47-76d0dc036f75">
											<gml:posList>35.6590834922626 139.69860776984132 48.657 35.6590834922626 139.69860776984132 48.377 35.65907173813702 139.69857536235452 48.377 35.65907173813702 139.69857536235452 48.657 35.6590834922626 139.69860776984132 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-3c4fefbe-541a-46f8-98f4-30cf2634a524">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3c4fefbe-541a-46f8-98f4-30cf2634a524">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3c4fefbe-541a-46f8-98f4-30cf2634a524">
											<gml:posList>35.65911185024861 139.69859232589513 48.657 35.65911185024861 139.69859232589513 48.377 35.6590834922626 139.69860776984132 48.377 35.6590834922626 139.69860776984132 48.657 35.65911185024861 139.69859232589513 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-8cacc81a-2dd2-40ce-9e3e-b607d1c7ad08">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-8cacc81a-2dd2-40ce-9e3e-b607d1c7ad08">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-8cacc81a-2dd2-40ce-9e3e-b607d1c7ad08">
											<gml:posList>35.65913372501817 139.69851842216056 45.1 35.65913372501817 139.69851842216056 44.781 35.659140620515444 139.69854256534327 44.781 35.659140620515444 139.69854256534327 45.1 35.65913372501817 139.69851842216056 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-3e015549-2a07-4cb7-9307-ab013c45bed0">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3e015549-2a07-4cb7-9307-ab013c45bed0">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3e015549-2a07-4cb7-9307-ab013c45bed0">
											<gml:posList>35.6590820599697 139.69860856746533 45.1 35.6590820599697 139.69860856746533 44.781 35.659019254380645 139.6986427458224 44.781 35.659019254380645 139.6986427458224 45.1 35.6590820599697 139.69860856746533 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-4adade3f-bca5-4614-8ff4-f6dcd8c2cde4">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-4adade3f-bca5-4614-8ff4-f6dcd8c2cde4">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-4adade3f-bca5-4614-8ff4-f6dcd8c2cde4">
											<gml:posList>35.65910009610654 139.6985599073545 48.657 35.65910009610654 139.6985599073545 48.377 35.65911185024861 139.69859232589513 48.377 35.65911185024861 139.69859232589513 48.657 35.65910009610654 139.6985599073545 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-3644dd46-b0ae-42a2-a70d-bf875b9afac2">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3644dd46-b0ae-42a2-a70d-bf875b9afac2">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3644dd46-b0ae-42a2-a70d-bf875b9afac2">
											<gml:posList>35.65899336744496 139.69859487744424 45.1 35.65899336744496 139.69859487744424 44.781 35.65913372501817 139.69851842216056 44.781 35.65913372501817 139.69851842216056 45.1 35.65899336744496 139.69859487744424 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-deed6cda-b2c7-429f-a4c7-71a27390b2b4">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-deed6cda-b2c7-429f-a4c7-71a27390b2b4">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-deed6cda-b2c7-429f-a4c7-71a27390b2b4">
											<gml:posList>35.659140620515444 139.69854256534327 45.1 35.659140620515444 139.69854256534327 44.781 35.65911009153814 139.69855918369885 44.781 35.65911009153814 139.69855918369885 45.1 35.659140620515444 139.69854256534327 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-eea14073-435e-4056-9742-b54e9c027cc9">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-eea14073-435e-4056-9742-b54e9c027cc9">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-eea14073-435e-4056-9742-b54e9c027cc9">
											<gml:posList>35.659019254380645 139.6986427458224 45.1 35.659019254380645 139.6986427458224 44.781 35.65899336744496 139.69859487744424 44.781 35.65899336744496 139.69859487744424 45.1 35.659019254380645 139.6986427458224 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-e1ca4f73-6fe7-4d54-9eee-799470b7a432">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-e1ca4f73-6fe7-4d54-9eee-799470b7a432">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-e1ca4f73-6fe7-4d54-9eee-799470b7a432">
											<gml:posList>35.65912042613842 139.69858768375835 45.1 35.65912042613842 139.69858768375835 44.781 35.65911329159218 139.69859156138946 44.781 35.65911329159218 139.69859156138946 45.1 35.65912042613842 139.69858768375835 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-d7e10054-ef5e-4358-add7-141783df3905">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-d7e10054-ef5e-4358-add7-141783df3905">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-d7e10054-ef5e-4358-add7-141783df3905">
											<gml:posList>35.65911215675685 139.69856014111787 18.19 35.65914257764372 139.69854358921214 18.19 35.65914257764372 139.69854358921214 45.1 35.65911215675685 139.69856014111787 45.1 35.65911215675685 139.69856014111787 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-4a8edaa3-cacb-44f2-a428-74573b5c743c">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-4a8edaa3-cacb-44f2-a428-74573b5c743c">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-4a8edaa3-cacb-44f2-a428-74573b5c743c">
											<gml:posList>35.658991049990426 139.6985940529857 18.19 35.659018689196365 139.69864514346907 18.19 35.659018689196365 139.69864514346907 45.1 35.658991049990426 139.6985940529857 45.1 35.658991049990426 139.6985940529857 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-7cb0bb78-d760-4610-af24-c887ca3d1c0f">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-7cb0bb78-d760-4610-af24-c887ca3d1c0f">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-7cb0bb78-d760-4610-af24-c887ca3d1c0f">
											<gml:posList>35.65911009153814 139.69855918369885 45.1 35.65911009153814 139.69855918369885 44.781 35.65912042613842 139.69858768375835 44.781 35.65912042613842 139.69858768375835 45.1 35.65911009153814 139.69855918369885 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-1cb663c0-b8fb-416d-a0dc-5c8a0f4455fb">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-1cb663c0-b8fb-416d-a0dc-5c8a0f4455fb">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-1cb663c0-b8fb-416d-a0dc-5c8a0f4455fb">
											<gml:posList>35.65914257764372 139.69854358921214 18.19 35.659134641512686 139.6985158251144 18.19 35.659134641512686 139.6985158251144 45.1 35.65914257764372 139.69854358921214 45.1 35.65914257764372 139.69854358921214 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-589e39ac-1b03-475b-87e8-92ad19ab7335">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-589e39ac-1b03-475b-87e8-92ad19ab7335">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-589e39ac-1b03-475b-87e8-92ad19ab7335">
											<gml:posList>35.659134641512686 139.6985158251144 18.19 35.658991049990426 139.6985940529857 18.19 35.658991049990426 139.6985940529857 45.1 35.659134641512686 139.6985158251144 45.1 35.659134641512686 139.6985158251144 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-aead2f97-c02d-4858-a806-1267a0593890">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-aead2f97-c02d-4858-a806-1267a0593890">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-aead2f97-c02d-4858-a806-1267a0593890">
											<gml:posList>35.65911329159218 139.69859156138946 45.1 35.65911329159218 139.69859156138946 44.781 35.659100904511405 139.69855737675974 44.781 35.659100904511405 139.69855737675974 48.657 35.65911392451784 139.69859331643394 48.657 35.65911392451784 139.69859331643394 45.1 35.65911329159218 139.69859156138946 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-fd07f5d0-f820-45a2-acce-236c8cf21356">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fd07f5d0-f820-45a2-acce-236c8cf21356">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fd07f5d0-f820-45a2-acce-236c8cf21356">
											<gml:posList>35.659122491369246 139.6985886522229 18.19 35.65911215675685 139.69856014111787 18.19 35.65911215675685 139.69856014111787 45.1 35.659122491369246 139.6985886522229 45.1 35.659122491369246 139.6985886522229 18.19</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-b70af752-aa1f-4b1e-a599-c047054b663b">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-b70af752-aa1f-4b1e-a599-c047054b663b">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-b70af752-aa1f-4b1e-a599-c047054b663b">
											<gml:posList>35.659069672893715 139.69857438284623 48.657 35.659100904511405 139.69855737675974 48.657 35.659100904511405 139.69855737675974 44.781 35.659069672893715 139.69857438284623 44.781 35.659069672893715 139.69857438284623 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f2d2d9f8-ecaf-4ea5-a025-ab9ba42325e7">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f2d2d9f8-ecaf-4ea5-a025-ab9ba42325e7">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f2d2d9f8-ecaf-4ea5-a025-ab9ba42325e7">
											<gml:posList>35.65907173813702 139.69857536235452 48.657 35.65907173813702 139.69857536235452 48.377 35.65910009610654 139.6985599073545 48.377 35.65910009610654 139.6985599073545 48.657 35.65907173813702 139.69857536235452 48.657</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-0012c016-4140-482d-bb7c-e90eb7b26562">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-0012c016-4140-482d-bb7c-e90eb7b26562">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-0012c016-4140-482d-bb7c-e90eb7b26562">
											<gml:posList>35.65911392451784 139.69859331643394 45.1 35.65911392451784 139.69859331643394 48.657 35.659082692882755 139.6986103114646 48.657 35.659082692882755 139.6986103114646 45.1 35.659018689196365 139.69864514346907 45.1 35.659018689196365 139.69864514346907 18.19 35.659122491369246 139.6985886522229 18.19 35.659122491369246 139.6985886522229 45.1 35.65911392451784 139.69859331643394 45.1</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-437708b8-54f5-4970-bb5c-cca43ff799fa">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-437708b8-54f5-4970-bb5c-cca43ff799fa">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-437708b8-54f5-4970-bb5c-cca43ff799fa">
											<gml:posList>35.6590820599697 139.69860856746533 45.1 35.659082692882755 139.6986103114646 45.1 35.659082692882755 139.6986103114646 48.657 35.659069672893715 139.69857438284623 48.657 35.659069672893715 139.69857438284623 44.781 35.6590820599697 139.69860856746533 44.781 35.6590820599697 139.69860856746533 45.1</gml:posList>
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
									<xAL:LocalityName Type="Town">東京都渋谷区道玄坂二丁目</xAL:LocalityName>
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
					<uro:depth uom="m">0.027</uro:depth>
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
					<uro:buildingRoofEdgeArea uom="m2">0.91706</uro:buildingRoofEdgeArea>
					<uro:fireproofStructureType codeSpace="../../codelists/BuildingDetailAttribute_fireproofStructureType.xml">1001</uro:fireproofStructureType>
					<uro:urbanPlanType codeSpace="../../codelists/Common_urbanPlanType.xml">21</uro:urbanPlanType>
					<uro:areaClassificationType codeSpace="../../codelists/Common_areaClassificationType.xml">22</uro:areaClassificationType>
					<uro:districtsAndZonesType codeSpace="../../codelists/Common_districtsAndZonesType.xml">10</uro:districtsAndZonesType>
					<uro:landUseType codeSpace="../../codelists/Common_landUseType.xml">212</uro:landUseType>
					<uro:detailedUsage codeSpace="../../codelists/BuildingDetailAttribute_detailedUsage.xml">1221</uro:detailedUsage>
					<uro:specifiedBuildingCoverageRate>80</uro:specifiedBuildingCoverageRate>
					<uro:specifiedFloorAreaRate>800</uro:specifiedFloorAreaRate>
					<uro:surveyYear>2021</uro:surveyYear>
				</uro:BuildingDetailAttribute>
			</uro:buildingDetailAttribute>
			<uro:buildingIDAttribute>
				<uro:BuildingIDAttribute>
					<uro:buildingID>13113-bldg-1491</uro:buildingID>
					<uro:prefecture codeSpace="../../codelists/Common_localPublicAuthorities.xml">13</uro:prefecture>
					<uro:city codeSpace="../../codelists/Common_localPublicAuthorities.xml">13113</uro:city>
				</uro:BuildingIDAttribute>
			</uro:buildingIDAttribute>
		</bldg:Building>
	</core:cityObjectMember>
	<core:cityObjectMember>
		<bldg:Building gml:id="bldg_e02a6469-973f-4054-8c49-76ac3bcc17fa">
			<core:creationDate>2024-03-15</core:creationDate>
			<gen:stringAttribute name="延べ面積換算係数">
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="説明注記">
				<gen:value> </gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="大字・町コード">
				<gen:value>20</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="町・丁目コード">
				<gen:value>2</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="13+区市町村コード+大字・町コード+町・丁目コード">
				<gen:value>13113020002</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="地区計画">
				<gen:value>道玄坂二丁目地区</gen:value>
			</gen:stringAttribute>
			<bldg:class codeSpace="../../codelists/Building_class.xml">3002</bldg:class>
			<bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
			<bldg:measuredHeight uom="m">30.5</bldg:measuredHeight>
			<bldg:storeysAboveGround>8</bldg:storeysAboveGround>
			<bldg:storeysBelowGround>1</bldg:storeysBelowGround>
			<bldg:lod0RoofEdge>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.65924745167591 139.69815680356768 0 35.659373597715174 139.69811550455037 0 35.65936461669873 139.69806438255844 0 35.65923143042081 139.69809718908732 0 35.65924745167591 139.69815680356768 0</gml:posList>
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
											<gml:posList>35.65924745167591 139.69815680356768 18.8 35.65923143042081 139.69809718908732 18.8 35.65936461669873 139.69806438255844 18.8 35.659373597715174 139.69811550455037 18.8 35.65924745167591 139.69815680356768 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65924745167591 139.69815680356768 18.8 35.659373597715174 139.69811550455037 18.8 35.659373597715174 139.69811550455037 49.3 35.65924745167591 139.69815680356768 49.3 35.65924745167591 139.69815680356768 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659373597715174 139.69811550455037 18.8 35.65936461669873 139.69806438255844 18.8 35.65936461669873 139.69806438255844 49.3 35.659373597715174 139.69811550455037 49.3 35.659373597715174 139.69811550455037 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65936461669873 139.69806438255844 18.8 35.65923143042081 139.69809718908732 18.8 35.65923143042081 139.69809718908732 49.3 35.65936461669873 139.69806438255844 49.3 35.65936461669873 139.69806438255844 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65923143042081 139.69809718908732 18.8 35.65924745167591 139.69815680356768 18.8 35.65924745167591 139.69815680356768 49.3 35.65923143042081 139.69809718908732 49.3 35.65923143042081 139.69809718908732 18.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65924745167591 139.69815680356768 49.3 35.659373597715174 139.69811550455037 49.3 35.65936461669873 139.69806438255844 49.3 35.65923143042081 139.69809718908732 49.3 35.65924745167591 139.69815680356768 49.3</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly-026b9b00-aa5c-4401-8310-27cfd70bfb47"/>
							<gml:surfaceMember xlink:href="#poly-94b64043-64d8-4baf-88eb-60de5eed8800"/>
							<gml:surfaceMember xlink:href="#poly-a67673d4-4e4b-4320-9e5c-78f5a0e09b60"/>
							<gml:surfaceMember xlink:href="#poly-1b53e499-65ea-4df8-a746-2213498215ef"/>
							<gml:surfaceMember xlink:href="#poly-b07dc35f-76d2-44a0-969b-a9b49dfa3c05"/>
							<gml:surfaceMember xlink:href="#poly-d36a5898-1fc6-4fbb-9055-e183fc7060b3"/>
							<gml:surfaceMember xlink:href="#poly-dfe7799a-7409-4688-a5c9-f960947d4b09"/>
							<gml:surfaceMember xlink:href="#poly-f1ca5f8b-d4cb-4edf-a2f3-d416b8849d6e"/>
							<gml:surfaceMember xlink:href="#poly-6334e9c5-bb87-43e3-81cd-90b8819e3dc4"/>
							<gml:surfaceMember xlink:href="#poly-6360f598-cda7-4039-8cc5-c7f56366295f"/>
							<gml:surfaceMember xlink:href="#poly-0dd0e2d8-f6eb-4dcc-8e46-cf5c9a6230ab"/>
							<gml:surfaceMember xlink:href="#poly-2636ca9c-6f99-4a93-af3e-b33dea7ff615"/>
							<gml:surfaceMember xlink:href="#poly-92a09dc9-783c-45f6-9360-883d11c51c07"/>
							<gml:surfaceMember xlink:href="#poly-4da3be3d-7aea-44d2-b308-91c49faaf8c5"/>
							<gml:surfaceMember xlink:href="#poly-f74c52c8-5bb5-4125-ab3c-5821bc87477d"/>
							<gml:surfaceMember xlink:href="#poly-29c080f1-9495-4e49-b15b-c708baf0711d"/>
							<gml:surfaceMember xlink:href="#poly-f8c5cec6-a508-45ac-a11c-7f12ada9130d"/>
							<gml:surfaceMember xlink:href="#poly-04440e54-eac8-42be-bf1c-af1ecef3d1bf"/>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod2Solid>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_e02a6469-973f-4054-8c49-76ac3bcc17fa_BuildingInstallation_1041">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-72daf947-f4e9-49c1-b7c5-cceaea70474a">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659290687210806 139.69808955667565 49.054 35.65929826873272 139.69813055296672 49.054 35.65924712265709 139.6981447432871 49.054 35.65923954116483 139.69810376911016 49.054 35.659290687210806 139.69808955667565 49.054</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-7d2e91e5-200e-4c4c-a911-eef1ce13198d">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-7d2e91e5-200e-4c4c-a911-eef1ce13198d_0">
											<gml:posList>35.65923954116483 139.69810376911016 49.5 35.65923954116483 139.69810376911016 49.054 35.65924712265709 139.6981447432871 49.054 35.65924712265709 139.6981447432871 49.5 35.65924522729463 139.69813450802567 49.865 35.659243331918894 139.69812426172 50.029 35.65924143654229 139.69811401541483 49.865 35.65923954116483 139.69810376911016 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-6b22875d-6988-4718-bdea-b6572f2521e5">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-6b22875d-6988-4718-bdea-b6572f2521e5_0">
											<gml:posList>35.659290687210806 139.69808955667565 49.5 35.659290687210806 139.69808955667565 49.054 35.65923954116483 139.69810376911016 49.054 35.65923954116483 139.69810376911016 49.5 35.659290687210806 139.69808955667565 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-040a3819-c56f-4154-804a-96bcef4b9d5c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-040a3819-c56f-4154-804a-96bcef4b9d5c_0">
											<gml:posList>35.6592925825895 139.69809980298652 49.865 35.659290687210806 139.69808955667565 49.5 35.65923954116483 139.69810376911016 49.5 35.65924143654229 139.69811401541483 49.865 35.6592925825895 139.69809980298652 49.865</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-61a0e394-b016-4e4d-b738-4f7f0e4ebe6c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-61a0e394-b016-4e4d-b738-4f7f0e4ebe6c_0">
											<gml:posList>35.65929447796731 139.69811004929787 50.029 35.6592925825895 139.69809980298652 49.865 35.65924143654229 139.69811401541483 49.865 35.659243331918894 139.69812426172 50.029 35.65929447796731 139.69811004929787 50.029</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ad19c237-3aa2-429c-8b77-9ee54dba0cde">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ad19c237-3aa2-429c-8b77-9ee54dba0cde_0">
											<gml:posList>35.65929637334425 139.6981202956097 49.865 35.65929447796731 139.69811004929787 50.029 35.659243331918894 139.69812426172 50.029 35.65924522729463 139.69813450802567 49.865 35.65929637334425 139.6981202956097 49.865</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9abac84c-95d4-4a9b-9b9b-30b659a72179">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9abac84c-95d4-4a9b-9b9b-30b659a72179_0">
											<gml:posList>35.65924712265709 139.6981447432871 49.5 35.65929826873272 139.69813055296672 49.5 35.65929637334425 139.6981202956097 49.865 35.65924522729463 139.69813450802567 49.865 35.65924712265709 139.6981447432871 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-028385f3-5bf8-4800-960b-e04897cb7bf1">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-028385f3-5bf8-4800-960b-e04897cb7bf1_0">
											<gml:posList>35.65924712265709 139.6981447432871 49.5 35.65924712265709 139.6981447432871 49.054 35.65929826873272 139.69813055296672 49.054 35.65929826873272 139.69813055296672 49.5 35.65924712265709 139.6981447432871 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-95a70b71-438e-4d1d-b69b-04694f95df04">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-95a70b71-438e-4d1d-b69b-04694f95df04_0">
											<gml:posList>35.65929826873272 139.69813055296672 49.5 35.65929826873272 139.69813055296672 49.054 35.659290687210806 139.69808955667565 49.054 35.659290687210806 139.69808955667565 49.5 35.6592925825895 139.69809980298652 49.865 35.65929447796731 139.69811004929787 50.029 35.65929637334425 139.6981202956097 49.865 35.65929826873272 139.69813055296672 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_e02a6469-973f-4054-8c49-76ac3bcc17fa_BuildingInstallation_1070">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-fe23ce51-402e-4341-a35b-9f5ec0b3cd4d">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65932423043881 139.6981003349994 49.054 35.65932714064924 139.6981152957044 49.054 35.659313624450164 139.69811922832434 49.054 35.65931072325397 139.6981042676065 49.054 35.65932423043881 139.6981003349994 49.054</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-5fbd9376-2577-41cb-b377-13ff978a8891">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659335847396356 139.69807469163285 49.5 35.65932602513928 139.69807711594765 49.5 35.659325516884905 139.69807401323513 49.5 35.65933533915431 139.6980715999647 49.5 35.659335847396356 139.69807469163285 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-aadcc215-9d21-4462-9ed9-e570cb680f3c">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.659335847396356 139.69807469163285 49.054 35.659339432439644 139.69809660938336 49.054 35.65932961918345 139.69809902263566 49.054 35.65932602513928 139.69807711594765 49.054 35.659335847396356 139.69807469163285 49.054</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ffbf4703-eff0-4404-bebf-2392699850c8">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65935551828625 139.6980772760641 54.055 35.65935792092773 139.6980897415196 54.055 35.6593444137061 139.698093640996 54.055 35.65934201106502 139.69808117554254 54.055 35.65935551828625 139.6980772760641 54.055</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-968bd213-6406-4cdb-b21a-54a2160f2f20">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-968bd213-6406-4cdb-b21a-54a2160f2f20_0">
											<gml:posList>35.65933533915431 139.6980715999647 49.5 35.659325516884905 139.69807401323513 49.5 35.659325516884905 139.69807401323513 51.732 35.65933533915431 139.6980715999647 51.732 35.65933533915431 139.6980715999647 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-52b6c1ea-9b17-4515-8787-5715bc1b2c06">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-52b6c1ea-9b17-4515-8787-5715bc1b2c06_0">
											<gml:posList>35.65932602513928 139.69807711594765 49.5 35.659335847396356 139.69807469163285 49.5 35.659335847396356 139.69807469163285 49.054 35.65932602513928 139.69807711594765 49.054 35.65932602513928 139.69807711594765 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-569ca60d-adf9-4afa-9e31-ca8148d06bf0">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-569ca60d-adf9-4afa-9e31-ca8148d06bf0_0">
											<gml:posList>35.65935551828625 139.6980772760641 57.373 35.65935551828625 139.6980772760641 54.055 35.65934201106502 139.69808117554254 54.055 35.65934201106502 139.69808117554254 57.373 35.65935551828625 139.6980772760641 57.373</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-2b200e9e-0c11-4d75-bba4-393c2db93fe1">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-2b200e9e-0c11-4d75-bba4-393c2db93fe1_0">
											<gml:posList>35.65935792092773 139.6980897415196 57.373 35.65935792092773 139.6980897415196 54.055 35.65935551828625 139.6980772760641 54.055 35.65935551828625 139.6980772760641 57.373 35.65935792092773 139.6980897415196 57.373</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-48e1dba8-2904-4a0a-b225-0dc1aa457bff">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-48e1dba8-2904-4a0a-b225-0dc1aa457bff_0">
											<gml:posList>35.659335847396356 139.69807469163285 49.5 35.65933533915431 139.6980715999647 49.5 35.65933533915431 139.6980715999647 51.732 35.659339432439644 139.69809660938336 51.732 35.659339432439644 139.69809660938336 49.054 35.659335847396356 139.69807469163285 49.054 35.659335847396356 139.69807469163285 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e260766c-5868-4e2d-9cef-285b19dd9864">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e260766c-5868-4e2d-9cef-285b19dd9864_0">
											<gml:posList>35.65933533915431 139.6980715999647 51.732 35.659325516884905 139.69807401323513 51.732 35.65932961918345 139.69809902263566 51.732 35.659339432439644 139.69809660938336 51.732 35.65933533915431 139.6980715999647 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-b71260e8-5682-493c-82cf-57391de50162">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-b71260e8-5682-493c-82cf-57391de50162_0">
											<gml:posList>35.65935551828625 139.6980772760641 57.373 35.65934201106502 139.69808117554254 57.373 35.6593444137061 139.698093640996 57.373 35.65935792092773 139.6980897415196 57.373 35.65935551828625 139.6980772760641 57.373</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-1abd94a5-a546-4fa8-a6d9-f5d78f000df9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-1abd94a5-a546-4fa8-a6d9-f5d78f000df9_0">
											<gml:posList>35.65932602513928 139.69807711594765 49.5 35.65932602513928 139.69807711594765 49.054 35.65932961918345 139.69809902263566 49.054 35.65932961918345 139.69809902263566 51.732 35.659325516884905 139.69807401323513 51.732 35.659325516884905 139.69807401323513 49.5 35.65932602513928 139.69807711594765 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-aa1a7e85-10b6-4953-bf4c-40e0cf085122">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-aa1a7e85-10b6-4953-bf4c-40e0cf085122_0">
											<gml:posList>35.6593444137061 139.698093640996 57.373 35.65934201106502 139.69808117554254 57.373 35.65934201106502 139.69808117554254 54.055 35.6593444137061 139.698093640996 54.055 35.6593444137061 139.698093640996 57.373</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-595971a9-713a-4e98-a84e-8c1612c72e3e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-595971a9-713a-4e98-a84e-8c1612c72e3e_0">
											<gml:posList>35.65935792092773 139.6980897415196 57.373 35.6593444137061 139.698093640996 57.373 35.6593444137061 139.698093640996 54.055 35.65935792092773 139.6980897415196 54.055 35.65935792092773 139.6980897415196 57.373</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-80f675c3-3012-4d9c-a71d-7fb3782951d3">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-80f675c3-3012-4d9c-a71d-7fb3782951d3_0">
											<gml:posList>35.659339432439644 139.69809660938336 51.732 35.65932961918345 139.69809902263566 51.732 35.65932961918345 139.69809902263566 49.054 35.659339432439644 139.69809660938336 49.054 35.659339432439644 139.69809660938336 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-4da731a0-f3da-41c2-899e-ffb32298d97b">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-4da731a0-f3da-41c2-899e-ffb32298d97b_0">
											<gml:posList>35.65931072325397 139.6981042676065 51.732 35.65932423043881 139.6981003349994 51.732 35.65932423043881 139.6981003349994 49.054 35.65931072325397 139.6981042676065 49.054 35.65931072325397 139.6981042676065 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-22f26988-adba-4c60-a6ff-a43ee4ff8fe3">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-22f26988-adba-4c60-a6ff-a43ee4ff8fe3_0">
											<gml:posList>35.65932423043881 139.6981003349994 51.732 35.65932714064924 139.6981152957044 51.732 35.65932714064924 139.6981152957044 49.054 35.65932423043881 139.6981003349994 49.054 35.65932423043881 139.6981003349994 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-5698ea4d-ce52-4776-bcff-30274c849380">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-5698ea4d-ce52-4776-bcff-30274c849380_0">
											<gml:posList>35.659313624450164 139.69811922832434 51.732 35.65932714064924 139.6981152957044 51.732 35.65932423043881 139.6981003349994 51.732 35.65931072325397 139.6981042676065 51.732 35.659313624450164 139.69811922832434 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-bf8ef98a-f9ad-409a-a7dc-112701f48c91">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-bf8ef98a-f9ad-409a-a7dc-112701f48c91_0">
											<gml:posList>35.65931072325397 139.6981042676065 51.732 35.65931072325397 139.6981042676065 49.054 35.659313624450164 139.69811922832434 49.054 35.659313624450164 139.69811922832434 51.732 35.65931072325397 139.6981042676065 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-3c7c7708-2697-44bf-a19a-308da005e634">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-3c7c7708-2697-44bf-a19a-308da005e634_0">
											<gml:posList>35.65932714064924 139.6981152957044 51.732 35.659313624450164 139.69811922832434 51.732 35.659313624450164 139.69811922832434 49.054 35.65932714064924 139.6981152957044 49.054 35.65932714064924 139.6981152957044 51.732</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:boundedBy>
				<bldg:GroundSurface gml:id="surface-026b9b00-aa5c-4401-8310-27cfd70bfb47">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-026b9b00-aa5c-4401-8310-27cfd70bfb47">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-026b9b00-aa5c-4401-8310-27cfd70bfb47">
											<gml:posList>35.6592474516759 139.69815680356768 18.83 35.65923143042082 139.69809718908732 18.83 35.659364616698724 139.69806438255844 18.83 35.65937359771517 139.69811550455037 18.83 35.6592474516759 139.69815680356768 18.83</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:GroundSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-d36a5898-1fc6-4fbb-9055-e183fc7060b3">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-d36a5898-1fc6-4fbb-9055-e183fc7060b3">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-d36a5898-1fc6-4fbb-9055-e183fc7060b3">
											<gml:posList>35.659341401887005 139.69810860064368 54.055 35.65937068844735 139.69810138323518 54.055 35.659364616698724 139.69806438255844 54.055 35.659335339141904 139.69807158891996 54.055 35.659341401887005 139.69810860064368 54.055</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-b07dc35f-76d2-44a0-969b-a9b49dfa3c05">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-b07dc35f-76d2-44a0-969b-a9b49dfa3c05">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-b07dc35f-76d2-44a0-969b-a9b49dfa3c05">
											<gml:posList>35.65937359771517 139.69811550455037 49.5 35.6593705575349 139.6981132344595 49.5 35.65924913296557 139.69815299030552 49.5 35.6592474516759 139.69815680356768 49.5 35.65937359771517 139.69811550455037 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-a67673d4-4e4b-4320-9e5c-78f5a0e09b60">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-a67673d4-4e4b-4320-9e5c-78f5a0e09b60">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-a67673d4-4e4b-4320-9e5c-78f5a0e09b60">
											<gml:posList>35.659335339141904 139.69807158891996 49.5 35.65923143042082 139.69809718908732 49.5 35.659234777216966 139.69809959119334 49.5 35.659335847396356 139.69807469163285 49.5 35.659335339141904 139.69807158891996 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-dfe7799a-7409-4688-a5c9-f960947d4b09">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-dfe7799a-7409-4688-a5c9-f960947d4b09">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-dfe7799a-7409-4688-a5c9-f960947d4b09">
											<gml:posList>35.65937068844735 139.69810138323518 49.5 35.65936860684719 139.69810189480262 49.5 35.6593705575349 139.6981132344595 49.5 35.65937359771517 139.69811550455037 49.5 35.659364616698724 139.69806438255844 49.5 35.65937068844735 139.69810138323518 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-94b64043-64d8-4baf-88eb-60de5eed8800">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-94b64043-64d8-4baf-88eb-60de5eed8800">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-94b64043-64d8-4baf-88eb-60de5eed8800">
											<gml:posList>35.659234777216966 139.69809959119334 49.5 35.65923143042082 139.69809718908732 49.5 35.6592474516759 139.69815680356768 49.5 35.65924913296557 139.69815299030552 49.5 35.659234777216966 139.69809959119334 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-1b53e499-65ea-4df8-a746-2213498215ef">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-1b53e499-65ea-4df8-a746-2213498215ef">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-1b53e499-65ea-4df8-a746-2213498215ef">
											<gml:posList>35.65924913296557 139.69815299030552 49.054 35.6593705575225 139.6981132234148 49.054 35.65936860684719 139.69810189480262 49.054 35.659341401887005 139.69810860064368 49.054 35.659335847396356 139.69807469163285 49.054 35.659234777216966 139.69809959119334 49.054 35.65924913296557 139.69815299030552 49.054</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-29c080f1-9495-4e49-b15b-c708baf0711d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-29c080f1-9495-4e49-b15b-c708baf0711d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-29c080f1-9495-4e49-b15b-c708baf0711d">
											<gml:posList>35.659364616698724 139.69806438255844 54.055 35.65937068844735 139.69810138323518 54.055 35.65937068844735 139.69810138323518 49.5 35.659364616698724 139.69806438255844 49.5 35.659364616698724 139.69806438255844 54.055</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-4da3be3d-7aea-44d2-b308-91c49faaf8c5">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-4da3be3d-7aea-44d2-b308-91c49faaf8c5">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-4da3be3d-7aea-44d2-b308-91c49faaf8c5">
											<gml:posList>35.659335339141904 139.69807158891996 54.055 35.659335339141904 139.69807158891996 49.5 35.659335847396356 139.69807469163285 49.5 35.659335847396356 139.69807469163285 49.054 35.659341401887005 139.69810860064368 49.054 35.659341401887005 139.69810860064368 54.055 35.659335339141904 139.69807158891996 54.055</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-6360f598-cda7-4039-8cc5-c7f56366295f">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-6360f598-cda7-4039-8cc5-c7f56366295f">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-6360f598-cda7-4039-8cc5-c7f56366295f">
											<gml:posList>35.659234777216966 139.69809959119334 49.5 35.659234777216966 139.69809959119334 49.054 35.659335847396356 139.69807469163285 49.054 35.659335847396356 139.69807469163285 49.5 35.659234777216966 139.69809959119334 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-04440e54-eac8-42be-bf1c-af1ecef3d1bf">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-04440e54-eac8-42be-bf1c-af1ecef3d1bf">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-04440e54-eac8-42be-bf1c-af1ecef3d1bf">
											<gml:posList>35.65936860684719 139.69810189480262 49.5 35.65936860684719 139.69810189480262 49.054 35.6593705575225 139.6981132234148 49.054 35.6593705575349 139.6981132344595 49.5 35.65936860684719 139.69810189480262 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f8c5cec6-a508-45ac-a11c-7f12ada9130d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f8c5cec6-a508-45ac-a11c-7f12ada9130d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f8c5cec6-a508-45ac-a11c-7f12ada9130d">
											<gml:posList>35.65937359771517 139.69811550455037 18.83 35.659364616698724 139.69806438255844 18.83 35.659364616698724 139.69806438255844 49.5 35.65937359771517 139.69811550455037 49.5 35.65937359771517 139.69811550455037 18.83</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f1ca5f8b-d4cb-4edf-a2f3-d416b8849d6e">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f1ca5f8b-d4cb-4edf-a2f3-d416b8849d6e">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f1ca5f8b-d4cb-4edf-a2f3-d416b8849d6e">
											<gml:posList>35.65923143042082 139.69809718908732 18.83 35.6592474516759 139.69815680356768 18.83 35.6592474516759 139.69815680356768 49.5 35.65923143042082 139.69809718908732 49.5 35.65923143042082 139.69809718908732 18.83</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f74c52c8-5bb5-4125-ab3c-5821bc87477d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f74c52c8-5bb5-4125-ab3c-5821bc87477d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f74c52c8-5bb5-4125-ab3c-5821bc87477d">
											<gml:posList>35.65937068844735 139.69810138323518 54.055 35.659341401887005 139.69810860064368 54.055 35.659341401887005 139.69810860064368 49.054 35.65936860684719 139.69810189480262 49.054 35.65936860684719 139.69810189480262 49.5 35.65937068844735 139.69810138323518 49.5 35.65937068844735 139.69810138323518 54.055</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-0dd0e2d8-f6eb-4dcc-8e46-cf5c9a6230ab">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-0dd0e2d8-f6eb-4dcc-8e46-cf5c9a6230ab">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-0dd0e2d8-f6eb-4dcc-8e46-cf5c9a6230ab">
											<gml:posList>35.659335339141904 139.69807158891996 49.5 35.659335339141904 139.69807158891996 54.055 35.659364616698724 139.69806438255844 54.055 35.659364616698724 139.69806438255844 49.5 35.659364616698724 139.69806438255844 18.83 35.65923143042082 139.69809718908732 18.83 35.65923143042082 139.69809718908732 49.5 35.659335339141904 139.69807158891996 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-6334e9c5-bb87-43e3-81cd-90b8819e3dc4">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-6334e9c5-bb87-43e3-81cd-90b8819e3dc4">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-6334e9c5-bb87-43e3-81cd-90b8819e3dc4">
											<gml:posList>35.65924913296557 139.69815299030552 49.5 35.65924913296557 139.69815299030552 49.054 35.659234777216966 139.69809959119334 49.054 35.659234777216966 139.69809959119334 49.5 35.65924913296557 139.69815299030552 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-2636ca9c-6f99-4a93-af3e-b33dea7ff615">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-2636ca9c-6f99-4a93-af3e-b33dea7ff615">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-2636ca9c-6f99-4a93-af3e-b33dea7ff615">
											<gml:posList>35.6593705575349 139.6981132344595 49.5 35.6593705575225 139.6981132234148 49.054 35.65924913296557 139.69815299030552 49.054 35.65924913296557 139.69815299030552 49.5 35.6593705575349 139.6981132344595 49.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-92a09dc9-783c-45f6-9360-883d11c51c07">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-92a09dc9-783c-45f6-9360-883d11c51c07">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-92a09dc9-783c-45f6-9360-883d11c51c07">
											<gml:posList>35.6592474516759 139.69815680356768 18.83 35.65937359771517 139.69811550455037 18.83 35.65937359771517 139.69811550455037 49.5 35.6592474516759 139.69815680356768 49.5 35.6592474516759 139.69815680356768 18.83</gml:posList>
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
									<xAL:LocalityName Type="Town">東京都渋谷区道玄坂二丁目</xAL:LocalityName>
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
					<uro:depth uom="m">0.017</uro:depth>
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
					<uro:buildingRoofEdgeArea uom="m2">0.76768</uro:buildingRoofEdgeArea>
					<uro:fireproofStructureType codeSpace="../../codelists/BuildingDetailAttribute_fireproofStructureType.xml">1001</uro:fireproofStructureType>
					<uro:urbanPlanType codeSpace="../../codelists/Common_urbanPlanType.xml">21</uro:urbanPlanType>
					<uro:areaClassificationType codeSpace="../../codelists/Common_areaClassificationType.xml">22</uro:areaClassificationType>
					<uro:districtsAndZonesType codeSpace="../../codelists/Common_districtsAndZonesType.xml">10</uro:districtsAndZonesType>
					<uro:landUseType codeSpace="../../codelists/Common_landUseType.xml">212</uro:landUseType>
					<uro:detailedUsage codeSpace="../../codelists/BuildingDetailAttribute_detailedUsage.xml">1210</uro:detailedUsage>
					<uro:specifiedBuildingCoverageRate>80</uro:specifiedBuildingCoverageRate>
					<uro:specifiedFloorAreaRate>800</uro:specifiedFloorAreaRate>
					<uro:surveyYear>2021</uro:surveyYear>
				</uro:BuildingDetailAttribute>
			</uro:buildingDetailAttribute>
			<uro:buildingIDAttribute>
				<uro:BuildingIDAttribute>
					<uro:buildingID>13113-bldg-1876</uro:buildingID>
					<uro:prefecture codeSpace="../../codelists/Common_localPublicAuthorities.xml">13</uro:prefecture>
					<uro:city codeSpace="../../codelists/Common_localPublicAuthorities.xml">13113</uro:city>
				</uro:BuildingIDAttribute>
			</uro:buildingIDAttribute>
		</bldg:Building>
	</core:cityObjectMember>
</core:CityModel>
