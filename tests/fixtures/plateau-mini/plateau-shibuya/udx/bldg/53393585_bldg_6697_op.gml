<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:brid="http://www.opengis.net/citygml/bridge/2.0" xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:dem="http://www.opengis.net/citygml/relief/2.0" xmlns:frn="http://www.opengis.net/citygml/cityfurniture/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:grp="http://www.opengis.net/citygml/cityobjectgroup/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:pbase="http://www.opengis.net/citygml/profiles/base/2.0" xmlns:sch="http://www.ascc.net/xml/schematron" xmlns:smil20="http://www.w3.org/2001/SMIL20/" xmlns:smil20lang="http://www.w3.org/2001/SMIL20/Language" xmlns:tex="http://www.opengis.net/citygml/texturedsurface/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:tun="http://www.opengis.net/citygml/tunnel/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.2" xmlns:veg="http://www.opengis.net/citygml/vegetation/2.0" xmlns:wtr="http://www.opengis.net/citygml/waterbody/2.0" xmlns:xAL="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.geospatial.jp/iur/uro/3.2 ../../schemas/iur/uro/3.2/urbanObject.xsd http://www.opengis.net/citygml/2.0 http://schemas.opengis.net/citygml/2.0/cityGMLBase.xsd http://www.opengis.net/citygml/landuse/2.0 http://schemas.opengis.net/citygml/landuse/2.0/landUse.xsd http://www.opengis.net/citygml/building/2.0 http://schemas.opengis.net/citygml/building/2.0/building.xsd http://www.opengis.net/citygml/transportation/2.0 http://schemas.opengis.net/citygml/transportation/2.0/transportation.xsd http://www.opengis.net/citygml/generics/2.0 http://schemas.opengis.net/citygml/generics/2.0/generics.xsd http://www.opengis.net/citygml/cityobjectgroup/2.0 http://schemas.opengis.net/citygml/cityobjectgroup/2.0/cityObjectGroup.xsd http://www.opengis.net/gml http://schemas.opengis.net/gml/3.1.1/base/gml.xsd http://www.opengis.net/citygml/appearance/2.0 http://schemas.opengis.net/citygml/appearance/2.0/appearance.xsd">
	<gml:boundedBy>
		<gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
			<gml:lowerCorner>35.64964134960079 139.6870784064782 0</gml:lowerCorner>
			<gml:upperCorner>35.65894032163392 139.70025943012837 212.106</gml:upperCorner>
		</gml:Envelope>
	</gml:boundedBy>

	<core:cityObjectMember>
		<bldg:Building gml:id="bldg_9968d17d-2199-4212-b134-d05a18697a85">
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
				<gen:value>1</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="13+区市町村コード+大字・町コード+町・丁目コード">
				<gen:value>13113020001</gen:value>
			</gen:stringAttribute>
			<gen:stringAttribute name="地区計画">
				<gen:value>道玄坂一丁目地区</gen:value>
			</gen:stringAttribute>
			<bldg:class codeSpace="../../codelists/Building_class.xml">3002</bldg:class>
			<bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
			<bldg:measuredHeight uom="m">24.8</bldg:measuredHeight>
			<bldg:storeysAboveGround>6</bldg:storeysAboveGround>
			<bldg:storeysBelowGround>1</bldg:storeysBelowGround>
			<bldg:lod0RoofEdge>
				<gml:MultiSurface>
					<gml:surfaceMember>
						<gml:Polygon>
							<gml:exterior>
								<gml:LinearRing>
									<gml:posList>35.65737258336543 139.69984534811056 0 35.65734671421662 139.6997643248279 0 35.657233741810956 139.69981840982513 0 35.65725961092366 139.69989943301138 0 35.65737258336543 139.69984534811056 0</gml:posList>
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
											<gml:posList>35.65737258336543 139.69984534811056 20.8 35.65725961092366 139.69989943301138 20.8 35.657233741810956 139.69981840982513 20.8 35.65734671421662 139.6997643248279 20.8 35.65737258336543 139.69984534811056 20.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65737258336543 139.69984534811056 20.8 35.65734671421662 139.6997643248279 20.8 35.65734671421662 139.6997643248279 45.6 35.65737258336543 139.69984534811056 45.6 35.65737258336543 139.69984534811056 20.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65734671421662 139.6997643248279 20.8 35.657233741810956 139.69981840982513 20.8 35.657233741810956 139.69981840982513 45.6 35.65734671421662 139.6997643248279 45.6 35.65734671421662 139.6997643248279 20.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.657233741810956 139.69981840982513 20.8 35.65725961092366 139.69989943301138 20.8 35.65725961092366 139.69989943301138 45.6 35.657233741810956 139.69981840982513 45.6 35.657233741810956 139.69981840982513 20.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65725961092366 139.69989943301138 20.8 35.65737258336543 139.69984534811056 20.8 35.65737258336543 139.69984534811056 45.6 35.65725961092366 139.69989943301138 45.6 35.65725961092366 139.69989943301138 20.8</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon>
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65737258336543 139.69984534811056 45.6 35.65734671421662 139.6997643248279 45.6 35.657233741810956 139.69981840982513 45.6 35.65725961092366 139.69989943301138 45.6 35.65737258336543 139.69984534811056 45.6</gml:posList>
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
							<gml:surfaceMember xlink:href="#poly-097309d4-ca86-47af-ae80-1b5fa33e104e"/>
							<gml:surfaceMember xlink:href="#poly-85fdf3be-dc4a-41a9-8907-5702d47e342d"/>
							<gml:surfaceMember xlink:href="#poly-47e3e928-47fc-4be3-94eb-fd57be59119a"/>
							<gml:surfaceMember xlink:href="#poly-327c4686-3ae7-4d5f-aa98-d4007d7ce756"/>
							<gml:surfaceMember xlink:href="#poly-e192485b-420c-4387-a09c-22e891ba2e74"/>
							<gml:surfaceMember xlink:href="#poly-3bb86e9e-dd15-48bf-8650-97dcb83b2fc9"/>
							<gml:surfaceMember xlink:href="#poly-046d3b09-9379-44ab-90ff-878e97f6cb70"/>
							<gml:surfaceMember xlink:href="#poly-8e046c84-a5fc-4c74-a516-9662a4176c18"/>
							<gml:surfaceMember xlink:href="#poly-29a37380-7144-47ee-91ba-2f07df61d152"/>
							<gml:surfaceMember xlink:href="#poly-ec23dd28-2f95-4da7-b5ad-0eaaab1687df"/>
							<gml:surfaceMember xlink:href="#poly-ede52765-de49-4484-92d7-93c6bb5e28b1"/>
							<gml:surfaceMember xlink:href="#poly-2c0518cf-67ab-4584-9ccf-ee1cbfbe8dd9"/>
							<gml:surfaceMember xlink:href="#poly-fa88d27f-5799-4960-9fb4-421306e8e904"/>
							<gml:surfaceMember xlink:href="#poly-face1d7b-7ef6-41e3-9626-ffc3f6a96fef"/>
							<gml:surfaceMember xlink:href="#poly-74c82d94-1dc4-425e-800d-d23e506fd3f7"/>
							<gml:surfaceMember xlink:href="#poly-8c43581f-9f4e-4dfd-aabe-0111703edee3"/>
							<gml:surfaceMember xlink:href="#poly-dc24dc2a-db1b-48d9-996b-e1cfe131a959"/>
							<gml:surfaceMember xlink:href="#poly-6e6d21a4-4dfe-4260-a2d8-a06ff825d22a"/>
							<gml:surfaceMember xlink:href="#poly-e447dd84-3af4-4a17-b48b-48d0b6d77637"/>
							<gml:surfaceMember xlink:href="#poly-f16a5be4-9050-45cb-a333-dd2499d5dfbf"/>
							<gml:surfaceMember xlink:href="#poly-2106c796-8b29-4e4a-b968-51fb39088e41"/>
							<gml:surfaceMember xlink:href="#poly-d1b5a63a-97a9-46e3-a988-b49b1476d562"/>
							<gml:surfaceMember xlink:href="#poly-1230a0d1-5596-4386-ba9c-b3f8588d59c3"/>
							<gml:surfaceMember xlink:href="#poly-3b28fa7f-0e16-4295-aadc-12a27a0f9dcc"/>
							<gml:surfaceMember xlink:href="#poly-50c31c84-088e-45f2-b5fc-e155b054f456"/>
							<gml:surfaceMember xlink:href="#poly-a9825df1-8c14-48b2-9457-086acb0ae1a1"/>
							<gml:surfaceMember xlink:href="#poly-9105f8e9-caa7-45c1-b4d7-cc8fddd81099"/>
							<gml:surfaceMember xlink:href="#poly-63804414-5096-42eb-8d34-e96e59f531e9"/>
							<gml:surfaceMember xlink:href="#poly-50100325-e349-4fcb-9157-f24c504be92f"/>
							<gml:surfaceMember xlink:href="#poly-643ddae9-4364-4bfd-84d1-ed2c67832421"/>
							<gml:surfaceMember xlink:href="#poly-61247e26-d9b1-47d6-b6f0-88dab371faf8"/>
							<gml:surfaceMember xlink:href="#poly-83049251-b070-4900-b1ab-6a611cd3dac1"/>
						</gml:CompositeSurface>
					</gml:exterior>
				</gml:Solid>
			</bldg:lod2Solid>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_9968d17d-2199-4212-b134-d05a18697a85_BuildingInstallation_1070">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-0d017114-8c3d-4ba6-9b92-5bc71efb4cd3">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65727587948168 139.69980071274813 49.059 35.65728865419046 139.69979459494547 49.059 35.65729354766429 139.6998099606764 49.059 35.6572807729425 139.69981606743255 49.059 35.65727587948168 139.69980071274813 49.059</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-003233aa-8bdd-414c-ba8f-5532fd2ff7b0">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.657358042524216 139.69982757968154 45.248 35.65735999628476 139.69983370610578 45.248 35.65735250982989 139.69983728592572 45.248 35.65734794202925 139.69982297990796 45.248 35.65734838004102 139.69981967688554 45.248 35.65734974818109 139.69981791853925 45.248 35.65735987426224 139.6998130752554 45.248 35.65736365512703 139.69982490862503 45.248 35.657358042524216 139.69982757968154 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-33729bfa-c3b5-4b06-b4f0-6fc18b64d337">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65736151390388 139.69981229941388 45.5 35.65736528574277 139.69982412175432 45.5 35.65736365512703 139.69982490862503 45.5 35.65735987426224 139.6998130752554 45.5 35.65736151390388 139.69981229941388 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-e77b24da-2e71-4b31-a6ef-81eb76dfefc4">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-e77b24da-2e71-4b31-a6ef-81eb76dfefc4_0">
											<gml:posList>35.65727587948168 139.69980071274813 49.059 35.6572807729425 139.69981606743255 49.059 35.6572807729425 139.69981606743255 51.797 35.65727587948168 139.69980071274813 51.797 35.65727587948168 139.69980071274813 49.059</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-343f61ba-9c98-4fc0-8d66-7cec46b1ee3b">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-343f61ba-9c98-4fc0-8d66-7cec46b1ee3b_0">
											<gml:posList>35.65727587948168 139.69980071274813 51.797 35.65728865419046 139.69979459494547 51.797 35.65728865419046 139.69979459494547 49.059 35.65727587948168 139.69980071274813 49.059 35.65727587948168 139.69980071274813 51.797</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-86719930-fbc6-4a63-9cf1-d56f406355bf">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-86719930-fbc6-4a63-9cf1-d56f406355bf_0">
											<gml:posList>35.65729354766429 139.6998099606764 51.797 35.65728865419046 139.69979459494547 51.797 35.65727587948168 139.69980071274813 51.797 35.6572807729425 139.69981606743255 51.797 35.65729354766429 139.6998099606764 51.797</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-efea2090-aa4f-434e-aec4-70c180ef4281">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-efea2090-aa4f-434e-aec4-70c180ef4281_0">
											<gml:posList>35.6572807729425 139.69981606743255 51.797 35.6572807729425 139.69981606743255 49.059 35.65729354766429 139.6998099606764 49.059 35.65729354766429 139.6998099606764 51.797 35.6572807729425 139.69981606743255 51.797</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9c2f1818-ecc1-45bc-ac5b-ee29e930521c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9c2f1818-ecc1-45bc-ac5b-ee29e930521c_0">
											<gml:posList>35.65728865419046 139.69979459494547 51.797 35.65729354766429 139.6998099606764 51.797 35.65729354766429 139.6998099606764 49.059 35.65728865419046 139.69979459494547 49.059 35.65728865419046 139.69979459494547 51.797</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-7547cbb1-4843-42e8-ae35-3140098a8512">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-7547cbb1-4843-42e8-ae35-3140098a8512_0">
											<gml:posList>35.65734794202925 139.69982297990796 47.441 35.65734838004102 139.69981967688554 47.441 35.65734838004102 139.69981967688554 45.248 35.65734794202925 139.69982297990796 45.248 35.65734794202925 139.69982297990796 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ba59e312-13c3-439c-9618-c8186afb773c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ba59e312-13c3-439c-9618-c8186afb773c_0">
											<gml:posList>35.65734838004102 139.69981967688554 47.441 35.65734974818109 139.69981791853925 47.441 35.65734974818109 139.69981791853925 45.248 35.65734838004102 139.69981967688554 45.248 35.65734838004102 139.69981967688554 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-523e1d58-63b5-4771-9e49-348342c881bf">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-523e1d58-63b5-4771-9e49-348342c881bf_0">
											<gml:posList>35.65734794202925 139.69982297990796 47.441 35.65734794202925 139.69982297990796 45.248 35.65735250982989 139.69983728592572 45.248 35.65735250982989 139.69983728592572 47.441 35.65734794202925 139.69982297990796 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-851547f6-90c2-429a-8a27-ee8a5992518e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-851547f6-90c2-429a-8a27-ee8a5992518e_0">
											<gml:posList>35.65735987426224 139.6998130752554 45.5 35.65735987426224 139.6998130752554 45.248 35.65734974818109 139.69981791853925 45.248 35.65734974818109 139.69981791853925 47.441 35.65736151390388 139.69981229941388 47.441 35.65736151390388 139.69981229941388 45.5 35.65735987426224 139.6998130752554 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-3dcbd523-c7b9-4881-b1f0-fa731df73d43">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-3dcbd523-c7b9-4881-b1f0-fa731df73d43_0">
											<gml:posList>35.65735999628476 139.69983370610578 47.441 35.65735250982989 139.69983728592572 47.441 35.65735250982989 139.69983728592572 45.248 35.65735999628476 139.69983370610578 45.248 35.65735999628476 139.69983370610578 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-ab91c85d-5b3c-494d-b791-4835360de3a9">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-ab91c85d-5b3c-494d-b791-4835360de3a9_0">
											<gml:posList>35.657358042524216 139.69982757968154 47.441 35.65736528574277 139.69982412175432 47.441 35.65736151390388 139.69981229941388 47.441 35.65734974818109 139.69981791853925 47.441 35.65734838004102 139.69981967688554 47.441 35.65734794202925 139.69982297990796 47.441 35.65735250982989 139.69983728592572 47.441 35.65735999628476 139.69983370610578 47.441 35.657358042524216 139.69982757968154 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9edefcb0-12ce-4c4a-90a2-b1074cece271">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9edefcb0-12ce-4c4a-90a2-b1074cece271_0">
											<gml:posList>35.657358042524216 139.69982757968154 47.441 35.65735999628476 139.69983370610578 47.441 35.65735999628476 139.69983370610578 45.248 35.657358042524216 139.69982757968154 45.248 35.657358042524216 139.69982757968154 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-9d8db725-d24b-4bfa-b01e-fd5393ec4fe4">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-9d8db725-d24b-4bfa-b01e-fd5393ec4fe4_0">
											<gml:posList>35.65736365512703 139.69982490862503 45.5 35.65736528574277 139.69982412175432 45.5 35.65736528574277 139.69982412175432 47.441 35.657358042524216 139.69982757968154 47.441 35.657358042524216 139.69982757968154 45.248 35.65736365512703 139.69982490862503 45.248 35.65736365512703 139.69982490862503 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-6b984947-2751-441a-8fbb-4e38e4ff5913">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-6b984947-2751-441a-8fbb-4e38e4ff5913_0">
											<gml:posList>35.65735987426224 139.6998130752554 45.248 35.65735987426224 139.6998130752554 45.5 35.65736365512703 139.69982490862503 45.5 35.65736365512703 139.69982490862503 45.248 35.65735987426224 139.6998130752554 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-82620d47-fc96-481d-a4cb-6fd9e24ad2e2">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-82620d47-fc96-481d-a4cb-6fd9e24ad2e2_0">
											<gml:posList>35.65736151390388 139.69981229941388 47.441 35.65736528574277 139.69982412175432 47.441 35.65736528574277 139.69982412175432 45.5 35.65736151390388 139.69981229941388 45.5 35.65736151390388 139.69981229941388 47.441</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:outerBuildingInstallation>
				<bldg:BuildingInstallation gml:id="bldg_9968d17d-2199-4212-b134-d05a18697a85_BuildingInstallation_1041">
					<bldg:lod2Geometry>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-75611580-bac0-4692-a47f-6ab3527f6e4f">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65727483643701 139.69984366634841 45.248 35.65729693662418 139.6998341644752 45.248 35.657303886100344 139.6998584507072 45.248 35.65728178591128 139.69986795257458 45.248 35.65727483643701 139.69984366634841 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-003c4c2c-4747-4c11-9f5c-ae8288d2420b">
									<gml:exterior>
										<gml:LinearRing>
											<gml:posList>35.65728265397917 139.69982977046473 45.248 35.65728044694018 139.69982283822316 45.248 35.65728227576004 139.69982196266773 45.248 35.657299086490205 139.6998139164153 45.248 35.6573012935297 139.69982084865825 45.248 35.65728265397917 139.69982977046473 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-fa99ba99-5962-483a-a38f-e4b9ab1daf13">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-fa99ba99-5962-483a-a38f-e4b9ab1daf13_0">
											<gml:posList>35.657299086490205 139.6998139164153 48.81 35.6573012935297 139.69982084865825 48.81 35.6573012935297 139.69982084865825 45.248 35.657299086490205 139.6998139164153 45.248 35.657299086490205 139.6998139164153 48.81</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-2cdaac43-9f0b-41dd-8143-73e1b9757d7b">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-2cdaac43-9f0b-41dd-8143-73e1b9757d7b_0">
											<gml:posList>35.657299086490205 139.6998139164153 45.248 35.65728227576004 139.69982196266773 45.248 35.65728227576004 139.69982196266773 48.81 35.657299086490205 139.6998139164153 48.81 35.657299086490205 139.6998139164153 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-a9f5f27f-1b6f-4052-95b4-c04f8106d33e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-a9f5f27f-1b6f-4052-95b4-c04f8106d33e_0">
											<gml:posList>35.65728265397917 139.69982977046473 48.81 35.6573012935297 139.69982084865825 48.81 35.657299086490205 139.6998139164153 48.81 35.65728227576004 139.69982196266773 48.81 35.65728044694018 139.69982283822316 48.81 35.65728265397917 139.69982977046473 48.81</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-76c55a25-df57-4015-ae87-ddc9b5668bcd">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-76c55a25-df57-4015-ae87-ddc9b5668bcd_0">
											<gml:posList>35.65728227576004 139.69982196266773 45.248 35.65728044694018 139.69982283822316 45.248 35.65728044694018 139.69982283822316 48.81 35.65728227576004 139.69982196266773 48.81 35.65728227576004 139.69982196266773 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-db57364f-ccb2-4d9d-adf1-64e5f07735f2">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-db57364f-ccb2-4d9d-adf1-64e5f07735f2_0">
											<gml:posList>35.6573012935297 139.69982084865825 48.81 35.65728265397917 139.69982977046473 48.81 35.65728265397917 139.69982977046473 45.248 35.6573012935297 139.69982084865825 45.248 35.6573012935297 139.69982084865825 48.81</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-6ebd8fe4-e8f1-4b86-a928-65b5d0f83649">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-6ebd8fe4-e8f1-4b86-a928-65b5d0f83649_0">
											<gml:posList>35.65728265397917 139.69982977046473 48.81 35.65728044694018 139.69982283822316 48.81 35.65728044694018 139.69982283822316 45.248 35.65728265397917 139.69982977046473 45.248 35.65728265397917 139.69982977046473 48.81</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-340014b1-92a2-47af-9110-595a5a629aad">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-340014b1-92a2-47af-9110-595a5a629aad_0">
											<gml:posList>35.65727483643701 139.69984366634841 47.77 35.65729693662418 139.6998341644752 47.77 35.65729693662418 139.6998341644752 45.248 35.65727483643701 139.69984366634841 45.248 35.65727483643701 139.69984366634841 47.77</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-81875e7c-7311-4b96-b0e9-5568a972930e">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-81875e7c-7311-4b96-b0e9-5568a972930e_0">
											<gml:posList>35.657303886100344 139.6998584507072 45.248 35.65729693662418 139.6998341644752 45.248 35.65729693662418 139.6998341644752 47.77 35.657303886100344 139.6998584507072 47.77 35.657303886100344 139.6998584507072 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-5c55d493-1fa8-4d0a-973c-ce5acaffc5b0">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-5c55d493-1fa8-4d0a-973c-ce5acaffc5b0_0">
											<gml:posList>35.657303886100344 139.6998584507072 47.77 35.65729693662418 139.6998341644752 47.77 35.65727483643701 139.69984366634841 47.77 35.65728178591128 139.69986795257458 47.77 35.657303886100344 139.6998584507072 47.77</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-7d8f4d8b-efa9-469f-9641-3f607dee0e3c">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-7d8f4d8b-efa9-469f-9641-3f607dee0e3c_0">
											<gml:posList>35.65727483643701 139.69984366634841 47.77 35.65727483643701 139.69984366634841 45.248 35.65728178591128 139.69986795257458 45.248 35.65728178591128 139.69986795257458 47.77 35.65727483643701 139.69984366634841 47.77</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
							<gml:surfaceMember>
								<gml:Polygon gml:id="fme-gen-04563223-56ac-44df-8fa6-af72b33e9910">
									<gml:exterior>
										<gml:LinearRing gml:id="fme-gen-04563223-56ac-44df-8fa6-af72b33e9910_0">
											<gml:posList>35.657303886100344 139.6998584507072 47.77 35.65728178591128 139.69986795257458 47.77 35.65728178591128 139.69986795257458 45.248 35.657303886100344 139.6998584507072 45.248 35.657303886100344 139.6998584507072 47.77</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2Geometry>
				</bldg:BuildingInstallation>
			</bldg:outerBuildingInstallation>
			<bldg:boundedBy>
				<bldg:GroundSurface gml:id="surface-097309d4-ca86-47af-ae80-1b5fa33e104e">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-097309d4-ca86-47af-ae80-1b5fa33e104e">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-097309d4-ca86-47af-ae80-1b5fa33e104e">
											<gml:posList>35.65737258336543 139.69984534811056 20.844 35.65725961092365 139.69989943301138 20.844 35.657233741810956 139.69981840982516 20.844 35.65734671421662 139.6997643248279 20.844 35.65737258336543 139.69984534811056 20.844</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:GroundSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-29a37380-7144-47ee-91ba-2f07df61d152">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-29a37380-7144-47ee-91ba-2f07df61d152">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-29a37380-7144-47ee-91ba-2f07df61d152">
											<gml:posList>35.657260266861925 139.69983250256865 45.248 35.65725367290785 139.6998118162499 45.248 35.65725160085205 139.69981281369903 45.248 35.65723664597061 139.69981997330243 45.248 35.6572608869452 139.69989588562117 45.248 35.65736968823214 139.69984379565918 45.248 35.65734544722497 139.69976788325343 45.248 35.657312294227246 139.69978374307001 45.248 35.65731021315796 139.69978474053562 45.248 35.6573168161304 139.69980542685173 45.248 35.657260266861925 139.69983250256865 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-e192485b-420c-4387-a09c-22e891ba2e74">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-e192485b-420c-4387-a09c-22e891ba2e74">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-e192485b-420c-4387-a09c-22e891ba2e74">
											<gml:posList>35.657260266861925 139.69983250256865 49.303 35.657261030690535 139.69983039180798 49.303 35.65725458147006 139.69981016911504 49.303 35.65725285883134 139.6998092552934 49.303 35.657260266861925 139.69983250256865 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-47e3e928-47fc-4be3-94eb-fd57be59119a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-47e3e928-47fc-4be3-94eb-fd57be59119a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-47e3e928-47fc-4be3-94eb-fd57be59119a">
											<gml:posList>35.65725961092365 139.69989943301138 45.5 35.6572608869452 139.69989588562117 45.5 35.65723664597061 139.69981997330243 45.5 35.657233741810956 139.69981840982516 45.5 35.65725961092365 139.69989943301138 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-3bb86e9e-dd15-48bf-8650-97dcb83b2fc9">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3bb86e9e-dd15-48bf-8650-97dcb83b2fc9">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3bb86e9e-dd15-48bf-8650-97dcb83b2fc9">
											<gml:posList>35.65725285883134 139.6998092552934 49.303 35.65725458147006 139.69981016911504 49.303 35.65730864425463 139.69978427928052 49.303 35.65730939908089 139.69978217957754 49.303 35.65725285883134 139.6998092552934 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-face1d7b-7ef6-41e3-9626-ffc3f6a96fef">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-face1d7b-7ef6-41e3-9626-ffc3f6a96fef">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-face1d7b-7ef6-41e3-9626-ffc3f6a96fef">
											<gml:posList>35.65734671421662 139.6997643248279 45.5 35.65734544722497 139.69976788325343 45.5 35.65736968823214 139.69984379565918 45.5 35.65737258336543 139.69984534811056 45.5 35.65734671421662 139.6997643248279 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-ec23dd28-2f95-4da7-b5ad-0eaaab1687df">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-ec23dd28-2f95-4da7-b5ad-0eaaab1687df">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-ec23dd28-2f95-4da7-b5ad-0eaaab1687df">
											<gml:posList>35.657312294227246 139.69978374307001 45.5 35.65730939908089 139.69978217957754 45.5 35.65731021315796 139.69978474053562 45.5 35.657312294227246 139.69978374307001 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-2c0518cf-67ab-4584-9ccf-ee1cbfbe8dd9">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-2c0518cf-67ab-4584-9ccf-ee1cbfbe8dd9">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-2c0518cf-67ab-4584-9ccf-ee1cbfbe8dd9">
											<gml:posList>35.65737258336543 139.69984534811056 45.5 35.65736968823214 139.69984379565918 45.5 35.6572608869452 139.69989588562117 45.5 35.65725961092365 139.69989943301138 45.5 35.65737258336543 139.69984534811056 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-327c4686-3ae7-4d5f-aa98-d4007d7ce756">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-327c4686-3ae7-4d5f-aa98-d4007d7ce756">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-327c4686-3ae7-4d5f-aa98-d4007d7ce756">
											<gml:posList>35.65725367290785 139.6998118162499 45.5 35.65725285883134 139.6998092552934 45.5 35.65725160085205 139.69981281369903 45.5 35.65725367290785 139.6998118162499 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-046d3b09-9379-44ab-90ff-878e97f6cb70">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-046d3b09-9379-44ab-90ff-878e97f6cb70">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-046d3b09-9379-44ab-90ff-878e97f6cb70">
											<gml:posList>35.65731510249314 139.69980450197 49.059 35.65730864425463 139.69978427928052 49.059 35.65725458147006 139.69981016911504 49.059 35.657261030690535 139.69983039180798 49.059 35.65731510249314 139.69980450197 49.059</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-fa88d27f-5799-4960-9fb4-421306e8e904">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-fa88d27f-5799-4960-9fb4-421306e8e904">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-fa88d27f-5799-4960-9fb4-421306e8e904">
											<gml:posList>35.65730939908089 139.69978217957754 45.5 35.657312294227246 139.69978374307001 45.5 35.65734544722497 139.69976788325343 45.5 35.65734671421662 139.6997643248279 45.5 35.65730939908089 139.69978217957754 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-8e046c84-a5fc-4c74-a516-9662a4176c18">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-8e046c84-a5fc-4c74-a516-9662a4176c18">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-8e046c84-a5fc-4c74-a516-9662a4176c18">
											<gml:posList>35.6573168161304 139.69980542685173 49.303 35.65731510249314 139.69980450197 49.303 35.657261030690535 139.69983039180798 49.303 35.657260266861925 139.69983250256865 49.303 35.6573168161304 139.69980542685173 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-85fdf3be-dc4a-41a9-8907-5702d47e342d">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-85fdf3be-dc4a-41a9-8907-5702d47e342d">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-85fdf3be-dc4a-41a9-8907-5702d47e342d">
											<gml:posList>35.657233741810956 139.69981840982516 45.5 35.65723664597061 139.69981997330243 45.5 35.65725160085205 139.69981281369903 45.5 35.65725285883134 139.6998092552934 45.5 35.657233741810956 139.69981840982516 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:RoofSurface gml:id="surface-ede52765-de49-4484-92d7-93c6bb5e28b1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-ede52765-de49-4484-92d7-93c6bb5e28b1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-ede52765-de49-4484-92d7-93c6bb5e28b1">
											<gml:posList>35.65730939908089 139.69978217957754 49.303 35.65730864425463 139.69978427928052 49.303 35.65731510249314 139.69980450197 49.303 35.6573168161304 139.69980542685173 49.303 35.65730939908089 139.69978217957754 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:RoofSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-50c31c84-088e-45f2-b5fc-e155b054f456">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-50c31c84-088e-45f2-b5fc-e155b054f456">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-50c31c84-088e-45f2-b5fc-e155b054f456">
											<gml:posList>35.65725285883134 139.6998092552934 45.5 35.65725285883134 139.6998092552934 49.303 35.65730939908089 139.69978217957754 49.303 35.65730939908089 139.69978217957754 45.5 35.65734671421662 139.6997643248279 45.5 35.65734671421662 139.6997643248279 20.844 35.657233741810956 139.69981840982516 20.844 35.657233741810956 139.69981840982516 45.5 35.65725285883134 139.6998092552934 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-61247e26-d9b1-47d6-b6f0-88dab371faf8">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-61247e26-d9b1-47d6-b6f0-88dab371faf8">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-61247e26-d9b1-47d6-b6f0-88dab371faf8">
											<gml:posList>35.65736968823214 139.69984379565918 45.5 35.65736968823214 139.69984379565918 45.248 35.6572608869452 139.69989588562117 45.248 35.6572608869452 139.69989588562117 45.5 35.65736968823214 139.69984379565918 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-e447dd84-3af4-4a17-b48b-48d0b6d77637">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-e447dd84-3af4-4a17-b48b-48d0b6d77637">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-e447dd84-3af4-4a17-b48b-48d0b6d77637">
											<gml:posList>35.657233741810956 139.69981840982516 20.844 35.65725961092365 139.69989943301138 20.844 35.65725961092365 139.69989943301138 45.5 35.657233741810956 139.69981840982516 45.5 35.657233741810956 139.69981840982516 20.844</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-d1b5a63a-97a9-46e3-a988-b49b1476d562">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-d1b5a63a-97a9-46e3-a988-b49b1476d562">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-d1b5a63a-97a9-46e3-a988-b49b1476d562">
											<gml:posList>35.657260266861925 139.69983250256865 45.248 35.657260266861925 139.69983250256865 49.303 35.65725285883134 139.6998092552934 49.303 35.65725285883134 139.6998092552934 45.5 35.65725367290785 139.6998118162499 45.5 35.65725367290785 139.6998118162499 45.248 35.657260266861925 139.69983250256865 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-3b28fa7f-0e16-4295-aadc-12a27a0f9dcc">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-3b28fa7f-0e16-4295-aadc-12a27a0f9dcc">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-3b28fa7f-0e16-4295-aadc-12a27a0f9dcc">
											<gml:posList>35.657260266861925 139.69983250256865 45.248 35.6573168161304 139.69980542685173 45.248 35.6573168161304 139.69980542685173 49.303 35.657260266861925 139.69983250256865 49.303 35.657260266861925 139.69983250256865 45.248</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-9105f8e9-caa7-45c1-b4d7-cc8fddd81099">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-9105f8e9-caa7-45c1-b4d7-cc8fddd81099">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-9105f8e9-caa7-45c1-b4d7-cc8fddd81099">
											<gml:posList>35.65731021315796 139.69978474053562 45.5 35.65730939908089 139.69978217957754 45.5 35.65730939908089 139.69978217957754 49.303 35.6573168161304 139.69980542685173 49.303 35.6573168161304 139.69980542685173 45.248 35.65731021315796 139.69978474053562 45.248 35.65731021315796 139.69978474053562 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-8c43581f-9f4e-4dfd-aabe-0111703edee3">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-8c43581f-9f4e-4dfd-aabe-0111703edee3">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-8c43581f-9f4e-4dfd-aabe-0111703edee3">
											<gml:posList>35.65725458147006 139.69981016911504 49.303 35.65725458147006 139.69981016911504 49.059 35.65730864425463 139.69978427928052 49.059 35.65730864425463 139.69978427928052 49.303 35.65725458147006 139.69981016911504 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-dc24dc2a-db1b-48d9-996b-e1cfe131a959">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-dc24dc2a-db1b-48d9-996b-e1cfe131a959">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-dc24dc2a-db1b-48d9-996b-e1cfe131a959">
											<gml:posList>35.65731510249314 139.69980450197 49.303 35.65731510249314 139.69980450197 49.059 35.657261030690535 139.69983039180798 49.059 35.657261030690535 139.69983039180798 49.303 35.65731510249314 139.69980450197 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-6e6d21a4-4dfe-4260-a2d8-a06ff825d22a">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-6e6d21a4-4dfe-4260-a2d8-a06ff825d22a">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-6e6d21a4-4dfe-4260-a2d8-a06ff825d22a">
											<gml:posList>35.65723664597061 139.69981997330243 45.5 35.65723664597061 139.69981997330243 45.248 35.65725160085205 139.69981281369903 45.248 35.65725160085205 139.69981281369903 45.5 35.65723664597061 139.69981997330243 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-a9825df1-8c14-48b2-9457-086acb0ae1a1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-a9825df1-8c14-48b2-9457-086acb0ae1a1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-a9825df1-8c14-48b2-9457-086acb0ae1a1">
											<gml:posList>35.65730864425463 139.69978427928052 49.303 35.65730864425463 139.69978427928052 49.059 35.65731510249314 139.69980450197 49.059 35.65731510249314 139.69980450197 49.303 35.65730864425463 139.69978427928052 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-74c82d94-1dc4-425e-800d-d23e506fd3f7">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-74c82d94-1dc4-425e-800d-d23e506fd3f7">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-74c82d94-1dc4-425e-800d-d23e506fd3f7">
											<gml:posList>35.65731021315796 139.69978474053562 45.5 35.65731021315796 139.69978474053562 45.248 35.657312294227246 139.69978374307001 45.248 35.657312294227246 139.69978374307001 45.5 35.65731021315796 139.69978474053562 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-1230a0d1-5596-4386-ba9c-b3f8588d59c3">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-1230a0d1-5596-4386-ba9c-b3f8588d59c3">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-1230a0d1-5596-4386-ba9c-b3f8588d59c3">
											<gml:posList>35.657261030690535 139.69983039180798 49.303 35.657261030690535 139.69983039180798 49.059 35.65725458147006 139.69981016911504 49.059 35.65725458147006 139.69981016911504 49.303 35.657261030690535 139.69983039180798 49.303</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-2106c796-8b29-4e4a-b968-51fb39088e41">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-2106c796-8b29-4e4a-b968-51fb39088e41">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-2106c796-8b29-4e4a-b968-51fb39088e41">
											<gml:posList>35.65725160085205 139.69981281369903 45.5 35.65725160085205 139.69981281369903 45.248 35.65725367290785 139.6998118162499 45.248 35.65725367290785 139.6998118162499 45.5 35.65725160085205 139.69981281369903 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-50100325-e349-4fcb-9157-f24c504be92f">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-50100325-e349-4fcb-9157-f24c504be92f">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-50100325-e349-4fcb-9157-f24c504be92f">
											<gml:posList>35.65734544722497 139.69976788325343 45.5 35.65734544722497 139.69976788325343 45.248 35.65736968823214 139.69984379565918 45.248 35.65736968823214 139.69984379565918 45.5 35.65734544722497 139.69976788325343 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-63804414-5096-42eb-8d34-e96e59f531e9">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-63804414-5096-42eb-8d34-e96e59f531e9">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-63804414-5096-42eb-8d34-e96e59f531e9">
											<gml:posList>35.657312294227246 139.69978374307001 45.5 35.657312294227246 139.69978374307001 45.248 35.65734544722497 139.69976788325343 45.248 35.65734544722497 139.69976788325343 45.5 35.657312294227246 139.69978374307001 45.5</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-83049251-b070-4900-b1ab-6a611cd3dac1">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-83049251-b070-4900-b1ab-6a611cd3dac1">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-83049251-b070-4900-b1ab-6a611cd3dac1">
											<gml:posList>35.65725961092365 139.69989943301138 20.844 35.65737258336543 139.69984534811056 20.844 35.65737258336543 139.69984534811056 45.5 35.65725961092365 139.69989943301138 45.5 35.65725961092365 139.69989943301138 20.844</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-643ddae9-4364-4bfd-84d1-ed2c67832421">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-643ddae9-4364-4bfd-84d1-ed2c67832421">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-643ddae9-4364-4bfd-84d1-ed2c67832421">
											<gml:posList>35.65737258336543 139.69984534811056 20.844 35.65734671421662 139.6997643248279 20.844 35.65734671421662 139.6997643248279 45.5 35.65737258336543 139.69984534811056 45.5 35.65737258336543 139.69984534811056 20.844</gml:posList>
										</gml:LinearRing>
									</gml:exterior>
								</gml:Polygon>
							</gml:surfaceMember>
						</gml:MultiSurface>
					</bldg:lod2MultiSurface>
				</bldg:WallSurface>
			</bldg:boundedBy>
			<bldg:boundedBy>
				<bldg:WallSurface gml:id="surface-f16a5be4-9050-45cb-a333-dd2499d5dfbf">
					<bldg:lod2MultiSurface>
						<gml:MultiSurface>
							<gml:surfaceMember>
								<gml:Polygon gml:id="poly-f16a5be4-9050-45cb-a333-dd2499d5dfbf">
									<gml:exterior>
										<gml:LinearRing gml:id="linr-f16a5be4-9050-45cb-a333-dd2499d5dfbf">
											<gml:posList>35.6572608869452 139.69989588562117 45.5 35.6572608869452 139.69989588562117 45.248 35.65723664597061 139.69981997330243 45.248 35.65723664597061 139.69981997330243 45.5 35.6572608869452 139.69989588562117 45.5</gml:posList>
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
					<uro:depth uom="m">0.044</uro:depth>
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
					<uro:buildingRoofEdgeArea uom="m2">1.06</uro:buildingRoofEdgeArea>
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
					<uro:buildingID>13113-bldg-1873</uro:buildingID>
					<uro:prefecture codeSpace="../../codelists/Common_localPublicAuthorities.xml">13</uro:prefecture>
					<uro:city codeSpace="../../codelists/Common_localPublicAuthorities.xml">13113</uro:city>
				</uro:BuildingIDAttribute>
			</uro:buildingIDAttribute>
		</bldg:Building>
	</core:cityObjectMember>
</core:CityModel>
