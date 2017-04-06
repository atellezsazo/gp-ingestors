'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');
const cheerio = require('cheerio');
const request = require('request');

const base_uri = "https://www.wikiart.org/"; // recent articles 

//Remove elements
const remove_elements = [
    'banner', //ads
    'noscript', //any script injection
    'script', //any script injection
    '.arrow-container',
    'h1',
    '.advertisement',
    '.thumbnails_container',
    '.social-container-flat',
];

//embbed content
const video_iframes = [
    'youtube', //YouTube
];

const remove_attr = ['src',
                     'id',
                     'class',
                     'border',
                     'style'
];

function ingest_article_profile(hatch, uri, uri_img) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        //Set title section
        const title = $profile('h1#h1Title').text();
        asset.set_title(title);

        asset.set_canonical_uri(uri);
        // Pull out the updated date
        asset.set_last_modified_date(new Date());
        
        //const section = $profile('.post-heading .meta');
        asset.set_section('Articles');

        // Pull out the main image
        const main_img = $profile('img[itemprop="image"]');
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        const body = $profile('.info').first();

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        const image_gallery = uri_img.map(function(obj) {
            let img_gallery = libingester.util.download_image(obj.image);
            img_gallery['title'] = obj.title;
            img_gallery['year'] = obj.year;
            hatch.save_asset(img_gallery);
            return img_gallery;
        });

        //Download images 
        body.find("img").map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for(const attr in remove_attr){
                    delete this.attribs[attr];
                }
            }
        });

        const content = mustache.render(template.structure_template, {
            title: title,
            asset_id: main_image.asset_id,
            body: body.html(),
            image_gallery: image_gallery
        });

        asset.set_document(content);
        hatch.save_asset(asset);
        console.log('OK: '+uri);
    }).catch((err) => {
        console.log('Error (Status Code): '+err.statusCode+' en '+uri);
        return ingest_article_profile(hatch, uri, uri_img);
    });
}
//getting img links (by each author)
function get_json_img_links(uri) {
    return rp({
        url: uri+'/mode/all-paintings?json=2',
        json: true,
        transform: function(body){
            const uri_img = [];
            if(body != undefined){
                if(body.Paintings != null){ //File may be empty
                    body.Paintings.map(function (obj){
                        uri_img.push(obj);
                    });
                }else{
                    console.log('JSON NULL en: '+uri+'/mode/all-paintings?json=2');
                }
            }
            return uri_img;
        }
    })
}

const main_link = ['https://www.wikiart.org/en/alphabet/a', 'https://www.wikiart.org/en/alphabet/b'];

function main(links) {
    let links_authors = []; //links of authors
    let authors_per_page = 2; //limits the number of authors
    const hatch = new libingester.Hatch();
    //1. getting author links
    Promise.all(main_link.map((uri) => {
        let n = 0;
        return libingester.util.fetch_html(uri).then(($page) => {
            const tags_a = $page('.artists-list').find('.title a');
            tags_a.map(function(index) {
                if( n++ < authors_per_page )
                    links_authors.push( url.resolve(base_uri, tags_a[index].attribs['href']) );
            });
        });
    }))
    //2. iterate every link
    .then(() => {
        console.log(links_authors);
        Promise.all( links_authors.map( function(uri) {
            return get_json_img_links(uri) //3. getting img links
            .then(uri_img => ingest_article_profile(hatch, uri, uri_img)) //4. getting article
            .catch(err => console.log("Error en "+uri+'/mode/all-paintings?json=2'));
        }))
        .then(() => {console.log('finish'); hatch.finish();})
        .catch((err) => console.log('ERROR hatch'))
    });
}

main(main_link);