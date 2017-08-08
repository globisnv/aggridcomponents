customProperties:"formComponent:false",
dataSource:"db:/example_data/orders",
extendsID:"B6DD20E9-965B-4C2F-BD59-53E4980C3244",
items:[
{
anchors:11,
customProperties:"methods:{\
onNodeExpanded:{\
arguments:null,\
parameters:null\
}\
}",
extendsID:"417538CB-85BE-44DC-BF0F-272138012A60",
json:{
anchors:11,
columns:[
{
dataprovider:"orderid",
headerTitle:"orderid",
svyUUID:"7513679C-D028-4BE9-BE27-1387E3A3EEAC"
},
{
dataprovider:"customerid",
headerTitle:"customerid",
rowGroupIndex:0,
svyUUID:"9276D0B7-B912-4C36-9188-9E3084C6C85E"
},
{
dataprovider:"shipcity",
headerTitle:"shipcity",
rowGroupIndex:2,
svyUUID:"CD3EF1C8-FB23-43A0-B710-1DCA08FB3A07"
},
{
dataprovider:"shipcountry",
headerTitle:"Country",
rowGroupIndex:1,
svyUUID:"6BB3541D-85F9-4CFB-A358-C3FDD6C87FE5"
}
],
location:{
x:43,
y:188
},
myFoundset:{
foundsetSelector:""
},
onNodeExpanded:"3A51E736-0073-4F0A-8BFF-E2C6702DE95A",
root:{
foundsetSelector:""
},
size:{
height:327,
width:550
}
},
location:"43,188",
size:"550,327",
typeid:47,
uuid:"2863EE32-CEAD-4F04-9D87-8B47CBF6700A"
},
{
location:"224,13",
onActionMethodID:"4B1FE7BB-FDFA-4E9F-9F2B-A5F686418617",
size:"80,20",
text:"Delete",
typeid:7,
uuid:"3B0BAA97-F451-4C8D-A5B0-7DF363A14C40"
},
{
labelFor:"shipcity",
location:"43,82",
name:"shipcity_label",
size:"80,20",
text:"Shipcity",
transparent:true,
typeid:7,
uuid:"41D76978-B0B7-477B-BA15-9E7522313948"
},
{
dataProviderID:"orderid",
editable:false,
location:"133,54",
name:"orderid",
size:"140,20",
text:"Orderid",
typeid:4,
uuid:"4AFE0826-3873-4E7C-8FE3-D770FD0F7413"
},
{
location:"332,50",
onActionMethodID:"0C14D91A-F2DC-45FA-AE6D-D59164BF391A",
size:"116,20",
text:"Sort CustomerID",
typeid:7,
uuid:"5F89C0F7-93B7-4A84-B6AD-60A9B613D850"
},
{
location:"136,13",
onActionMethodID:"59B773C8-7A03-44AD-8A31-311B77E5F8E3",
size:"80,20",
text:"Add",
typeid:7,
uuid:"8F567BE3-8F1A-47DD-89AF-A6CE01292E77"
},
{
labelFor:"orderid",
location:"43,54",
name:"orderid_label",
size:"80,20",
text:"Orderid",
transparent:true,
typeid:7,
uuid:"91C805A1-4E39-49BF-AEAF-F67A0E6B4F27"
},
{
dataProviderID:"shipcity",
location:"133,82",
name:"shipcity",
size:"140,20",
text:"Shipcity",
typeid:4,
uuid:"CA9C24C1-DBE3-4A76-A2DA-E6523D30311D"
},
{
extendsID:"069054D8-C700-480E-956F-D6A24215F74B",
height:527,
typeid:19,
uuid:"CC09F612-B96F-41AB-B039-9EA697EB6979"
}
],
name:"agGridOrders",
typeid:3,
uuid:"21DFF7C9-DA57-498E-8AC0-0E8E6038E361"