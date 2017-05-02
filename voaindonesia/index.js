'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://www.voaindonesia.com/';

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const date = $profile('div.published').find('time').first();
        const datetime = $profile(date).attr('datetime');
        asset.set_last_modified_date(new Date( Date.parse(datetime) ));
        const section_type = $profile('meta[property="og:type"]').attr('content');
        asset.set_section(section_type);

        // Pull out the main image
        const url_main_image = $profile('meta[property="og:image"]').attr('content');
        const main_img = libingester.util.download_image(url_main_image);
        const main_img_caption =  $profile('div.image').find('p[itemprop="caption"]').first();
        hatch.save_asset(main_img);

        // template data
        if( $profile('div.intro')[0] ){ // data for 'video post'
            var section = $profile('div.authors ul li').children();
            var body = $profile('div.intro').children();
        }else{                          // data for 'article post'
            var section = $profile('div.category').children();
            var body = $profile('div.body-container').find('div.wsw').first();
        }
        
        // download images
        body.find('img').map(function(){
            if( this.attribs.src ){
                const image = libingester.util.download_image( this.attribs.src );
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                hatch.save_asset(image);
            }
        });

        // download videos
        const videos = $profile('div.html5Player').find('video').map(function() {
            const video_url = this.attribs.src;
            const video_asset = new libingester.VideoAsset();
            video_asset.set_canonical_uri(video_url);
            video_asset.set_last_modified_date(datetime);
            video_asset.set_title(title);
            video_asset.set_download_uri(video_url);
            hatch.save_asset(video_asset);
        });

        // download audios
        const audios = $profile('div.html5Player').find('audio').map(function() {
            const audio_url = this.attribs.src;
            const audio_asset = new libingester.VideoAsset();
            audio_asset.set_canonical_uri(audio_url);
            audio_asset.set_last_modified_date(datetime);
            audio_asset.set_title(title);
            audio_asset.set_download_uri(audio_url);
            hatch.save_asset(audio_asset);
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            section: section.html(),
            date: date.html(),
            asset_id: main_img.asset_id,
            image_description: main_img_caption.html(),
            body: body.html(),
        });

        // save document
        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();
    const audio_urls = 'http://www.voaindonesia.com/z/585';
    const rss_urls = [
        'http://www.voaindonesia.com/api/zo-ovegyit',
        'http://www.voaindonesia.com/api/zrjqpeu_om',
    ];

    // getting url's
    const get_urls = () => {
        return new Promise(function (resolve, reject){
            libingester.util.fetch_html(audio_urls).then(($) => { //first... audio links
                const tag_links = $('ul#items').find('a.img-wrap');
                const links = tag_links.map(function () {
                    return url.resolve(base_uri, this.attribs.href);
                }).get();
                return links;
            }).then((links) => {
                const rss_promise = rss_urls.map(function(rss_url){ //second... articles and video links
                    return new Promise(function(res, reject){
                        rss2json.load(rss_url, function(err, rss){
                            rss.items.map((datum) => links.push(datum.url));
                            res();
                        });
                    });
                });
                Promise.all( rss_promise ).then(() => resolve(links));
            });
        });
    }

    // saving articles
    get_urls().then((post_urls) => {
        Promise.all(post_urls.map((uri) => ingest_article(hatch, uri))).then(() => {
            hatch.finish();
        });
    });
}

main();
