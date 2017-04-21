'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const template_artist = require('./template_artist');
const template_artwork = require('./template_artwork');
const url = require('url');

const base_uri = 'http://www.voaindonesia.com/';

//Remove elements (body)
const remove_elements = [
];

function ingest_artwork_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        asset.set_last_modified_date(new Date());
        asset.set_section('Artworks');

        // Pull out the main image
        const main_img = $profile('img[itemprop="image"]');
        const main_image = libingester.util.download_img(main_img, base_uri);
        const img_description = $profile(".image-wrapper .image-title-container");
        const img_copyrigth = img_description.find('.popup_copyPublicDomain .copyright-box').text();
        main_image.set_license(img_copyrigth);
        hatch.save_asset(main_image);

        const image_description = img_description.find('.svg-icon-public-domain a.pointer').text();

        let info = $profile('.info').first();
        const description = $profile('span[itemprop="description"]').text();

        //remove elements (info)
        for (const remove_element of remove_elements) {
            info.find(remove_element).remove();
        }

        //Fix relative links
        info.find("a").map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });

        const content = mustache.render(template_artwork.structure_template, {
            title: title,
            asset_id: main_image.asset_id,
            image_description: image_description,
            info: info.html(),
            description: description,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        return ingest_artwork_profile(hatch, uri);
    });
}

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        asset.set_last_modified_date(new Date());
        asset.set_section('Artist profile');

        // Pull out the main image
        const main_img = $profile('img[itemprop="image"]');
        const image_description = $profile(".image-wrapper .comment").children();
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        const additional_name = $profile('span[itemprop="additionalName"]').first().text();
        let info = $profile('.info').first();
        const description = $profile('span[itemprop="description"]').text();

        //remove elements (body)
        for (const remove_element of remove_elements) {
            info.find(remove_element).remove();
        }

        //Fix relative links
        info.find("a").map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });

        //Workarts
        let img_array = [];
        const download_workarts = (number_page = 1) => {
            const options = {
                uri: uri + `/mode/all-paintings?json=2&page=${number_page}`,
                json: true,
            };

            const promise = rp(options).then(function(body) {
                if (body.Paintings != null) {
                    for (const workart of body.Paintings) {
                        const asset = libingester.util.download_image(workart.image, base_uri);
                        hatch.save_asset(asset);
                        img_array.push({
                            title: workart.title,
                            year: workart.year,
                            asset: asset
                        });
                    }
                    return download_workarts(number_page + 1);
                }
            }).catch((err) => {
                download_workarts(number_page);
            });
            return promise;
        };

        download_workarts().then(function() {
            const content = mustache.render(template_artist.structure_template, {
                title: title,
                additional_name: additional_name,
                asset_id: main_image.asset_id,
                image_description: image_description,
                info: info,
                description: description,
                workarts: img_array,
            });

            asset.set_document(content);
            hatch.save_asset(asset);
        });

    }).catch((err) => {
        return ingest_artist_profile(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    // const artists = new Promise((resolve, reject) => {
    //     libingester.util.fetch_html(chronological_artists_uri).then(($artists) => {
    //         const artists_link = $artists('.artists-list li:nth-child(-n+1) li.title a').map(function() { //Only 10 artists
    //             const uri = $artists(this).attr('href');
    //             return url.resolve(chronological_artists_uri, uri);
    //         }).get();
    const post_urls = ['http://www.voaindonesia.com/a/facebook-gelar-konferensi-f8-/3814273.html'];
            Promise.all(post_urls.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
                hatch.finish();
            });
    //     });
    // });

    // const paintings = new Promise((resolve, reject) => {
    //     rp({ uri: paintings_json_uri, json: true }).then((response) => {
    //         if (response.Paintings != null) {
    //             const paintings_uris = response.Paintings.map((datum) => url.resolve(base_uri, datum.paintingUrl));
    //             Promise.all(paintings_uris.map((uri) => ingest_artwork_profile(hatch, uri))).then(() => {
    //                 resolve(true);
    //             });
    //         }
    //     });
    // });

    // Promise.all([paintings]).then(values => {
    //     return hatch.finish();
    // });

}

main();
