'use strict';

const fs = require('fs');
const less = require('less');
const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const articles = 'http://www.livingloving.net/'; // recent articles
const rss_feed = 'http://www.livingloving.net/feed/';
const style = fs.readFileSync('style.css');

//Remove elements
const remove_elements = [
    'banner',
    'div.jp-relatedposts',
    'div.post-tags',
    'div.sharedaddy',
    'input',
    'noscript',
    'script',
    'span.link_pages',
];

//Remove attributes (images)
const attr_image = [
    'class',
    'data-jpibfi-post-excerpt',
    'data-jpibfi-post-title',
    'data-jpibfi-post-url',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'width',
];

//embbed content
const video_iframes = [
    'youtube', //YouTube
];

// Divide a list into 'n' equal parts
function divide_in(array, n){
	const length = array.length;
	let res = [];
	let first = 0;
	let last = n;

	while( last<=length & first<last ){
		res.push( array.slice(first, last) );
		first = last;
		last += 3;
		if( last > length ){
			last = length;
		}
	}

	return res;
}

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // pull out the updated date and section
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        const article_entry = $profile('.post .post-heading .meta').first();
        const article_data = $profile(article_entry).text().split(' • ');
        const author = article_data[0];
        const date_published = article_data[1];
        const category = article_data[2];
        asset.set_last_modified_date(new Date( Date.parse(modified_date) ));
        const section = $profile('.post-heading .meta').children().text();
        asset.set_section(section);

        // set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);

        // pull out the main image
        const main_img = $profile('.post-img a img');
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        const body = $profile('.post-entry').first();

        // download videos
        const videos = $profile(".ytp-title .ytp-title-next a").map(function() {
            const iframe_src = this.attribs.src;
            for (const video_iframe of video_iframes) {
                if (iframe_src.includes(video_iframe)) {
                    const video_url = this.attribs.src;
                    const full_uri = url.format(video_url, { search: false })
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(full_uri);
                    video_asset.set_last_modified_date(modified_date);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(full_uri);
                    hatch.save_asset(video_asset);
                }
            }
        });

        // remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        // function download images
        const download_image = (img) => {
            const image = libingester.util.download_image( img.attribs.src );
            img.attribs["data-libingester-asset-id"] = image.asset_id;
            hatch.save_asset(image);
            for(const attr of attr_image){
                delete img.attribs[attr];
            }
        }

        const parraf = body.find('p[style="text-align: center;"]').first();
        if( parraf.text().indexOf('_') != -1 ){
            parraf[0].children = {type: 'tag', name: 'hr'};
            //console.log(parraf.text());
        }

        let count = 0;
        let parrafs = [];
        body.find('p').map(function(){
            if( this.children[0] ){
                if( this.children[0].name == 'img' ){
                    count++;
                    parrafs.push(this);
                }else{
                    if( count >= 3 ){
                        const p_of_p = divide_in(parrafs, 3);
                        for(const pp of p_of_p){
                            const size = pp.length;
                            let css_class = 'img-inline ';
                            if( size == 1 ){
                                css_class += 'one';
                            }else if( size == 2 ){
                                css_class += 'two';
                            }else if( size == 3 ){
                                css_class += 'three';
                            }
                            for(const p of pp){
                                p.attribs['class'] = css_class;
                            }
                        }
                    }
                    count = 0;
                    parrafs = [];
                }
            }
        });

        // download images
        const img_width = '620w'; // '1024w', '960w', '768', '670w', '620w', '150w' (not all sizes exist)
        body.find("img").map(function() {
            const src = this.attribs.src;
            const srcset = this.attribs.srcset;
            if ( srcset ) {
                let source;
                for(const uri of srcset.split(', ')){ // search img with 620w
                	if( uri.indexOf(img_width) != -1 ){
                        const lastIndex = uri.indexOf('jpg') + 3;
                        const firstIndex = uri.indexOf('http');
                        source = uri.substring(firstIndex, lastIndex);
                    }
                }
                if( source ){ //found size (img_width)
                    this.attribs.src = source;
                }
                download_image(this);
            }else if( src ){
                download_image(this);
            }
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            category: category,
            author: author,
            date_published: date_published,
            style: style,
            main_image: main_image,
            body: body.html()
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    // rss2json.load(rss_feed, function(err, rss){
    //     const articles_links =  rss.items.map((datum) => datum.url);
        const articles_links = ['http://www.livingloving.net/2017/events/giveaway/artworks-for-your-home-giveaway/'];
        Promise.all(articles_links.map((uri) => ingest_article(hatch, uri))).then(() => hatch.finish());
    // });
}

main();
