import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, classify, normalize } from '../src/normalize.js';

test('money is parsed exactly and rejects malformed or missing values',()=>{
  assert.equal(cents('99.99'),9999);assert.equal(cents('1.1'),110);assert.equal(cents('0'),0);
  for(const invalid of [null,undefined,'-1','NaN','$99','1.234',''])assert.equal(cents(invalid),null);
});
test('component classifier excludes computers and accessories',()=>{
  assert.equal(classify({title:'Corsair Vengeance DDR5 RAM 32GB'}),'RAM');
  assert.equal(classify({title:'Crucial SSD for Laptop and Desktop'}),'SSD');
  assert.equal(classify({title:'PNY NVIDIA Quadro RTX 4000',product_type:'GPU/Graphics Cards'}),'GPU');
  assert.equal(classify({title:'RTX 4070 Gaming Laptop',product_type:'Laptops'}),null);
  assert.equal(classify({title:'ORICO NVMe SSD Enclosure NO DRIVE'}),null);
  assert.equal(classify({title:'32GB microSD Memory Card'}),null);
  assert.equal(classify({title:'Graphics Card Riser Adapter'}),null);
  assert.equal(classify({title:'Power Supply with Memory Storage',product_type:'PSU/Power Supplies'}),null);
});
test('each condition is a distinct variant with its own price and availability',()=>{
  const rows=normalize([{id:1,title:'Samsung SSD',handle:'samsung-ssd',variants:[{id:10,title:'New',price:'100.01',available:true},{id:11,title:'Like New',price:'80',available:false}]}]);
  assert.equal(rows.length,2);assert.equal(rows[0].id,'1:10');assert.equal(rows[0].price,10001);
  assert.equal(rows[1].available,false);assert.match(rows[1].url,/variant=11$/);
});
test('invalid variants cannot fabricate a zero-dollar deal',()=>{
  assert.equal(normalize([{id:1,title:'Samsung SSD',handle:'ssd',variants:[{id:1,price:null,available:true},{id:2,price:'10',available:'true'}]}]).length,0);
  assert.throws(()=>normalize({}),/array/);
});
