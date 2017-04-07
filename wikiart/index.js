'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');

const base_uri = "https://www.wikiart.org/";

//Remove elements (body)
const remove_elements = [
    '.social-container-flat',
];

function ingest_gallery_profile(hatch, uri){
    return libingester.util.fetch_html(uri).then(($profile) => {
        // código para sacar la galeria
    })
}

function ingest_artist_profile(hatch, uri, uri_img) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        //Set title section
        const title = $profile('h1#h1Title').text();
        asset.set_title(title);

        asset.set_canonical_uri(uri);
        // Pull out the updated date
        asset.set_last_modified_date(new Date());
        asset.set_section('Articles');

        // Pull out the main image
        const main_img = $profile('img[itemprop="image"]');
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        let body = $profile('.info').first();
        //remove elements (body)
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }
        //Appears sometimes
        const description = $profile('span[itemprop="description"]');
        if( description.html() )
            body = body.html() + '<div class="description">' + description.html() + '</div>';
        else
            body = body.html();

        const image_gallery = uri_img.map(function(obj) {
            let img_gallery = libingester.util.download_image(obj.image);
            img_gallery['title'] = obj.title;
            img_gallery['year'] = obj.year;
            hatch.save_asset(img_gallery);
            return img_gallery;
        });

        const content = mustache.render(template.structure_template, {
            title: title,
            asset_id: main_image.asset_id,
            body: body,
            image_gallery: image_gallery
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
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
                }
            }
            return uri_img;
        }
    })
}

//generating url's
function get_array_alphabet(){
    //defghijklmnopqrstuvwxyzø
    const alphabet = 'abcdefghijklmnopqrstuvwxyzø';
    const wikiart_url = 'https://www.wikiart.org/en/alphabet/';
    let wikiart_alphabet_url = [];
    for(let i=0; i<alphabet.length; i++)
        wikiart_alphabet_url.push( wikiart_url + alphabet.charAt(i) );
    return wikiart_alphabet_url;
}

//set artist data in "artist_urls"
function get_artist_data(artist_page, artist_urls, max_authors){
    return new Promise(function(resolve, reject){
        libingester.util.fetch_html(artist_page) //Goes through a page of authors, multiple artists per page
        .then($page => {
            const url_author = $page('.artists-list').find('li.title a'); //various Artists
            let n = 0;
            const urls = [];
            url_author.map(index => {
                if( n++ < max_authors ){
                    urls.push( url.resolve(base_uri, url_author[index].attribs['href']) );
                }
            });
            return urls; //then, list of artist links
        })
        .then(urls => {
            urls.map(uri => {
                get_json_img_links(uri) //For each artist we get their artworks
                .then(uri_img => {
                    artist_urls.push( {'uri':uri, 'artworks':uri_img} );
                    resolve(true);
                }).catch(err => {
                    resolve(false);
                });
            });
        })
        .catch((err) => {
            resolve(false);
        })
    })
}

function get_link_artworks(base_uri, artworks_urls){
    return new Promise(function(resolve, reject){
        libingester.util.fetch_html(base_uri)
        .then($page => {
            const artworks = $page('ul.title li a');
            artworks.map(index => {
                //console.log(artwork);
                artworks_urls.push( url.resolve(base_uri, artworks[index].attribs['href']) );
            });
            resolve(true);
        }).catch((err) => {
            console.log('err '+base_uri);
            get_link_artworks(base_uri, artworks_urls)});
    })
}

function main() {
    //const hatch = new libingester.Hatch();
    let artwork_urls = []; //artworks links
    let artist_urls = []; //author data
    let authors_per_page = 1; //limits the number of authors
    // //1. getting artist pages
    const artist_pages = get_array_alphabet();
    //
    // //2. getting data for each author
    let artist_promises_links = artist_pages.map(uri => {
        return get_artist_data(uri, artist_urls, authors_per_page);
    });
    artist_promises_links.push( get_link_artworks(base_uri,artwork_urls) ); //add promise (artworks)

    // //3. then, ingest_article
    Promise.all(artist_promises_links).then(() => { //waiting for the data of each artist and artworks links
        // all artist
        let artist_promises = artist_urls.map(artist => {
            return ingest_article_profile(hatch, artist.uri, artist.artworks);
        });
        // all artworks
        let artwork_promises = artwork_urls.map(artwork_url => {
            return ingest_gallery_profile(hatch, artwork_url);
        });
        let all_promises = artist_promises.concat( artworks_promises );
        Promise.all(all_promises).then( () => hatch.finish() );
    });

}

main();
